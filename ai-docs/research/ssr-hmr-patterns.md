# SSR HMR Patterns in Modern Frameworks

Research on how popular frameworks implement SSR HMR using Vite's Environment API.

## Executive Summary

All major frameworks use a similar pattern for SSR HMR:

1. **Check if module exists in client graph** - Determines if it's SSR-only
2. **Invalidate SSR module graph** - Clear server-side caches
3. **Send full-reload or custom event** - Trigger client update

**Key finding:** No framework does true partial server re-rendering. All fall back to full page reload.

---

## Framework Implementations

### 1. Astro (`withastro/astro`)

**File:** `packages/astro/src/vite-plugin-hmr-reload/index.ts`
**Verified:** Both `main` and `next` branches have identical implementation (as of Jan 2026)

```typescript
export default function hmrReload(): Plugin {
  return {
    name: 'astro:hmr-reload',
    enforce: 'post',
    hotUpdate: {
      order: 'post',
      handler({ modules, server, timestamp }) {
        // Only run in SSR environment
        if (this.environment.name !== ASTRO_VITE_ENVIRONMENT_NAMES.ssr) return;

        let hasSsrOnlyModules = false;
        const invalidatedModules = new Set<EnvironmentModuleNode>();

        for (const mod of modules) {
          if (mod.id == null) continue;

          // KEY: Check if module exists in client graph
          const clientModule = server.environments.client.moduleGraph.getModuleById(mod.id);
          if (clientModule != null) continue; // Shared module, skip

          // SSR-only: invalidate in SSR graph only
          this.environment.moduleGraph.invalidateModule(mod, invalidatedModules, timestamp, true);
          hasSsrOnlyModules = true;
        }

        if (hasSsrOnlyModules) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  };
}
```

**Pattern:**

- Hook: `hotUpdate` with `order: 'post'`
- Environment: Only handles `ssr` environment
- Detection: `server.environments.client.moduleGraph.getModuleById(mod.id)`
- Result: Still does `full-reload`

**Note:** Astro has a separate "page partials" feature for rendering HTML without doctype - this is unrelated to HMR.

**Astro v6 (next branch) Environment API Details:**

The Environment API PR (#14306, Dec 2025) made significant architectural changes:

1. **Module Loading:** Changed from `server.ssrLoadModule(id)` to `environment.runner.import(id)`
2. **HMR Messages:** Changed from `viteServer.hot.send()` to `viteServer.environments.client.hot.send()`
3. **Module Graph:** Uses `ssrEnvironment.moduleGraph.getModuleById(id)` for SSR environment
4. **Plugin Container:** Uses `ssrEnvironment.pluginContainer.resolveId()` for resolution

**Key HMR Enhancement Pattern (from `vite.ts`):**

```typescript
// Wrap the client HMR send to enhance error messages
const _wsSend = viteServer.environments.client.hot.send;
viteServer.environments.client.hot.send = function (...args: any) {
  if (isTsconfigUpdated) {
    isTsconfigUpdated = false;
    return; // Block reload during server restart
  }
  const msg = args[0] as vite.HotPayload;
  if (msg?.type === 'error') {
    // Enhance HMR errors with Astro-specific metadata
    const err = collectErrorMetadata(msg.err, pathToFileURL(viteServer.config.root));
    getViteErrorPayload(err).then((payload) => {
      events.emit('hmr-error', { type: 'error', err: {...} });
      args[0] = payload;
      _wsSend.apply(this, args);
    });
    return;
  }
  _wsSend.apply(this, args);
};
```

**However**, the core HMR reload behavior remains unchanged - SSR-only modules still trigger `full-reload`.

---

### 2. Vike (`vikejs/vike`)

**File:** `packages/vike/src/node/vite/plugins/pluginWorkaroundVite6HmrRegression.ts`

```typescript
function pluginWorkaroundVite6HmrRegression(): Plugin[] {
  return [
    {
      name: 'vike:pluginWorkaroundVite6HmrRegression',
      enforce: 'post',
      hotUpdate: {
        order: 'post',
        handler({ modules, server, timestamp }) {
          if (this.environment.name !== 'ssr') return;

          let hasSsrOnlyModules = false;
          const invalidatedModules = new Set<any>();

          for (const mod of modules) {
            if (mod.id == null) continue;
            const clientModule = server.environments.client.moduleGraph.getModuleById(mod.id);
            if (clientModule != null) continue;

            this.environment.moduleGraph.invalidateModule(mod, invalidatedModules, timestamp, true);
            hasSsrOnlyModules = true;
          }

          if (hasSsrOnlyModules) {
            server.ws.send({ type: 'full-reload' });
            return [];
          }
        },
      },
    },
  ];
}
```

**Pattern:** Identical to Astro. Same file name suggests shared origin or copied pattern.

---

### 3. React Router (`remix-run/react-router`)

**File:** `packages/react-router-dev/vite/rsc/plugin.ts`

```typescript
{
  name: "react-router/rsc/hmr/updates",
  async hotUpdate(this, { server, file, modules }) {
    // Only handles RSC (React Server Components) environment
    if (this.environment.name !== "rsc") return;

    // Check client graph for the same file
    const clientModules = server.environments.client.moduleGraph.getModulesByFile(file);

    const vite = await import("vite");
    const isServerOnlyChange =
      !clientModules ||
      clientModules.size === 0 ||
      // Handle CSS injected from server-first routes
      (vite.isCSSRequest(file) &&
        Array.from(clientModules).some((mod) => mod.id?.includes("?direct")));

    // ... process modules ...

    // Send custom event with route metadata
    server.hot.send({
      type: "custom",
      event: "react-router:hmr",
      data: {
        routeId,
        isServerOnlyChange,
        hasAction,
        hasComponent,
        hasErrorBoundary,
        hasLoader,
      },
    });
  }
}
```

**Pattern:**

- Hook: `hotUpdate` (async)
- Environment: Only handles `rsc` environment
- Detection: `server.environments.client.moduleGraph.getModulesByFile(file)`
- CSS handling: Special case for `?direct` query
- **Custom event:** Sends route metadata with `hasLoader`, `hasAction`, etc.

**Key insight:** React Router tracks which exports changed and sends that info to the client.

---

### 4. React Router - Classic Plugin

**File:** `packages/react-router-dev/vite/plugin.ts`

```typescript
async handleHotUpdate({ server, file, modules, read }) {
  let route = getRoute(ctx.reactRouterConfig, file);

  type HmrEventData = { route: ManifestRoute | null };
  let hmrEventData: HmrEventData = { route: null };

  if (route) {
    // Invalidate manifest on route exports change
    let oldRouteMetadata = currentReactRouterManifestForDev?.routes[route.id];
    let newRouteMetadata = await getRouteMetadata(cache, ctx, viteChildCompiler, route, read);

    hmrEventData.route = newRouteMetadata;

    // Check if exports changed
    if (routeExportsChanged(oldRouteMetadata, newRouteMetadata)) {
      invalidateVirtualModules(server);
    }
  }

  // Send custom HMR event
  server.hot.send({
    type: "custom",
    event: "react-router:hmr",
    data: hmrEventData,
  });

  return modules;
}
```

**Pattern:** Uses legacy `handleHotUpdate` but sends custom events with route info.

---

### 5. Fresh (Deno) (`denoland/fresh`)

**File:** `packages/plugin-vite/src/plugins/dev_server.ts`

```typescript
{
  name: "fresh:server_hmr",
  applyToEnvironment(env) {
    return env.config.consumer === "server";
  },
  hotUpdate(options) {
    // Check if module exists in client graph
    const clientMod = options.server.environments.client.moduleGraph
      .getModulesByFile(options.file);

    if (clientMod !== undefined) {
      // Shared module - let default handling occur
      return;
    }

    // SSR-only module handling...
  }
}
```

**File:** `packages/plugin-vite/src/plugins/client_snapshot.ts`

```typescript
function invalidateSnapshots(server: ViteDevServer) {
  // Invalidate in client environment
  const client = server.environments.client.moduleGraph.getModuleById('\0fresh:client-snapshot');
  if (client !== undefined) {
    server.environments.client.moduleGraph.invalidateModule(client);
  }

  // Invalidate in SSR environment
  const ssr = server.environments.ssr.moduleGraph.getModuleById('\0fresh:server-snapshot');
  if (ssr !== undefined) {
    server.environments.ssr.moduleGraph.invalidateModule(ssr);
  }
}
```

**Pattern:**

- Uses `applyToEnvironment` to filter which environment the hook runs in
- Checks both client and SSR module graphs
- Invalidates virtual modules in both environments

---

### 6. VitePress (`vuejs/vitepress`)

**File:** `src/node/plugin.ts`

```typescript
async hotUpdate({ file, type }) {
  // Only runs in client environment
  if (this.environment.name !== 'client') return;

  const relativePath = path.posix.relative(srcDir, file);

  // Handle markdown file creation/deletion
  if (file.endsWith('.md') && type !== 'update') {
    await resolvePages(siteConfig);
  }

  // Handle config changes - restart server
  if (
    file === configPath ||
    configDeps.includes(file) ||
    isAdditionalConfigFile(file)
  ) {
    siteConfig.logger.info(
      c.green(`${path.relative(process.cwd(), file)} changed, restarting server...\n`)
    );
    // Triggers full restart, not just reload
  }
}
```

**Pattern:**

- Only handles `client` environment
- Config changes trigger server restart
- Markdown changes trigger page resolution

---

### 7. Vike Server (`vikejs/vike-server`)

**File:** `packages/vike-server/src/plugin/plugins/devServerPlugin.ts`

```typescript
async hotUpdate(ctx) {
  if (vikeServerConfig.hmr === false) return;

  const imported = isImported(ctx.modules);
  if (imported) {
    if (vikeServerConfig.hmr === 'prefer-restart') {
      restartProcess();
    } else {
      const invalidatedModules = new Set<EnvironmentModuleNode>();

      for (const mod of ctx.modules) {
        this.environment.moduleGraph.invalidateModule(
          mod,
          invalidatedModules,
          ctx.timestamp,
          true
        );
      }

      // Invalidate entry point
      invalidateEntry(this.environment, invalidatedModules, ctx.timestamp, true);

      // Wait for file to be ready
      await ctx.read();

      // Still full-reload
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    }
  }
}
```

**Pattern:**

- Configurable HMR behavior (`prefer-restart` vs HMR)
- Invalidates entry point explicitly
- Waits for file read before sending reload

---

### 8. Next.js HMR Types

**File:** `packages/next/src/server/dev/hot-reloader-types.ts`

```typescript
export const enum HMR_MESSAGE_SENT_TO_BROWSER {
  ADDED_PAGE = 'addedPage',
  REMOVED_PAGE = 'removedPage',
  RELOAD_PAGE = 'reloadPage',
  SERVER_COMPONENT_CHANGES = 'serverComponentChanges', // RSC-specific
  MIDDLEWARE_CHANGES = 'middlewareChanges',
  CLIENT_CHANGES = 'clientChanges',
  SERVER_ONLY_CHANGES = 'serverOnlyChanges', // KEY: Server-only distinction
  SYNC = 'sync',
  BUILT = 'built',
  BUILDING = 'building',
  // ...
}
```

**Pattern:**

- Distinguishes between `serverComponentChanges`, `clientChanges`, `serverOnlyChanges`
- Different handling for middleware vs page changes
- RSC has its own change type

---

### 9. Vue Core HMR Runtime

**File:** `packages/runtime-core/src/hmr.ts`

```typescript
export let isHmrUpdating = false;

// Tracks dirty components for HMR
export const hmrDirtyComponents: Map<ConcreteComponent, Set<ComponentInternalInstance>> = new Map();

export interface HMRRuntime {
  createRecord: typeof createRecord;
  rerender: typeof rerender; // Re-render single component
  reload: typeof reload; // Full reload
}

// Exposed on global for tooling
if (__DEV__) {
  // __VUE_HMR_RUNTIME__ = { createRecord, rerender, reload }
}
```

**Pattern:**

- Component-level tracking with `hmrDirtyComponents`
- Supports `rerender` (single component) vs `reload` (full)
- Runtime exposes HMR API for tooling

**Key insight:** Vue tracks which component instances are "dirty" and can re-render just those.

---

### 10. Nuxt vite-node

**File:** `packages/vite/src/vite-node-entry.ts`

```typescript
const runner = createRunner();
let render: (ssrContext: NuxtSSRContext) => Promise<any>;

export default async (ssrContext: NuxtSSRContext): Promise<any> => {
  process.server = true;
  import.meta.server = true;

  // Get invalidated modules since last render
  const invalidates = await viteNodeFetch.getInvalidates();

  // Invalidate dependency tree
  const updates = runner.moduleCache.invalidateDepTree(invalidates);

  // Re-execute entry if it was invalidated
  const start = performance.now();
  render =
    updates.has(viteNodeOptions.entryPath) || !render
      ? (await runner.executeFile(viteNodeOptions.entryPath)).default
      : render;

  // Log updates
  if (updates.size) {
    console.log(`[vite-node] ${updates.size} modules invalidated`);
  }

  return render(ssrContext);
};
```

**Pattern:**

- Uses vite-node for SSR module execution
- `invalidateDepTree` - invalidates module and its dependents
- Only re-executes entry if entry itself was invalidated
- Tracks and logs number of invalidated modules

---

### 11. Custom HMR Events Pattern

Multiple frameworks use custom events to communicate specific changes:

```typescript
// React Router
server.hot.send({
  type: 'custom',
  event: 'react-router:hmr',
  data: { routeId, hasLoader, hasAction, isServerOnlyChange },
});

// One.js
server.hot.send({
  type: 'custom',
  event: 'one:route-update',
  data: { file: fileRelativePath },
});

// Valaxy
server.hot.send({
  type: 'custom',
  event: 'valaxy:pageData',
  data: { path, pageData },
});

// TutorialKit
server.hot.send({
  type: 'custom',
  event: 'tk:refresh-wc-files',
  data: hotFilesRefs,
});
```

**Pattern:**

- `type: 'custom'` for framework-specific events
- Event name prefixed with framework name
- Data contains context about what changed

---

## Vite's Deprecation Path

**File:** `packages/vite/src/node/deprecations.ts`

```typescript
const deprecationCode = {
  removePluginHookHandleHotUpdate: 'changes/hotupdate-hook',
  removeServerModuleGraph: 'changes/per-environment-apis',
  removeServerReloadModule: 'changes/per-environment-apis',
  // ...
}

// Warning messages
removePluginHookHandleHotUpdate:
  'Plugin hook `handleHotUpdate()` is replaced with `hotUpdate()`.',

removeServerModuleGraph:
  'The `server.moduleGraph` is replaced with `this.environment.moduleGraph`.',

removeServerReloadModule:
  'The `server.reloadModule` is replaced with `environment.reloadModule`.',
```

**Key migration points:**

- `handleHotUpdate()` → `hotUpdate()`
- `server.moduleGraph` → `this.environment.moduleGraph`
- `server.reloadModule` → `environment.reloadModule`

---

## Key Insights for Qwik

### What Other Frameworks Do

1. **SSR-only detection:** All frameworks check `server.environments.client.moduleGraph.getModuleById(mod.id)` to determine if a module is SSR-only

2. **Full reload fallback:** Every framework still falls back to `full-reload` - none do true partial server re-rendering

3. **Custom events:** React Router sends route metadata (hasLoader, hasAction) which could inform smarter client behavior

4. **Component tracking:** Vue tracks dirty components at runtime, enabling per-component re-renders

### What Would Be Unique for Qwik

1. **QRL-aware invalidation:** Could potentially update individual QRLs without full reload

2. **routeLoader$ tracking:** Track which loaders are affected by module changes

3. **Partial resumability:** Leverage Qwik's serialization to update only affected parts

### Recommended Approach

**Phase 1 (Immediate):** Implement Astro/Vike pattern

- SSR-only module detection
- Environment-aware invalidation
- Still full-reload, but faster (no unnecessary client rebuild)

**Phase 2 (Future):** Smart loader tracking

- Track routeLoader$ → module dependencies
- Send custom event with stale loaders info
- Client skips unchanged loaders

**Phase 3 (Future):** Partial update protocol

- Track component → module → QRL relationships
- Re-render only affected components on server
- Send partial HTML updates via WebSocket

---

## References

- Astro: https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-hmr-reload/index.ts
- Vike: https://github.com/vikejs/vike/blob/main/packages/vike/src/node/vite/plugins/pluginWorkaroundVite6HmrRegression.ts
- React Router: https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/vite/rsc/plugin.ts
- Fresh: https://github.com/denoland/fresh/blob/main/packages/plugin-vite/src/plugins/dev_server.ts
- VitePress: https://github.com/vuejs/vitepress/blob/main/src/node/plugin.ts
- Vue HMR: https://github.com/vuejs/core/blob/main/packages/runtime-core/src/hmr.ts
- Nuxt: https://github.com/nuxt/nuxt/blob/main/packages/vite/src/vite-node-entry.ts
- Vite deprecations: https://github.com/vitejs/vite/blob/main/packages/vite/src/node/deprecations.ts
