# Qwik Vite Environment API Migration Strategy

## Executive Summary

This document outlines the strategy for migrating Qwik's Vite plugins to the Vite 6+ Environment API. Based on research of Nitro, Nuxt, Cloudflare Workers, VitePress, and Astro implementations, we recommend a phased approach with a feature flag for gradual adoption.

## Recommended Architecture

### Environment Structure

```typescript
// vite.config.ts (user config - unchanged)
export default defineConfig({
  plugins: [
    qwikVite(),
    qwikRouter(),
  ],
});

// Internal environment configuration
environments: {
  client: {
    consumer: 'client',
    resolve: {
      conditions: ['browser', 'import', 'module'],
    },
    optimizeDeps: {
      exclude: ['@qwik.dev/core', ...],
    },
    dev: {
      warmup: ['./src/root.tsx'],
      createEnvironment: (name, config) =>
        new QwikClientDevEnvironment(name, config),
    },
  },

  ssr: {
    consumer: 'server',
    resolve: {
      conditions: ['node', 'import', 'module'],
      noExternal: ['@qwik.dev/core', '@qwik.dev/router'],
    },
    dev: {
      createEnvironment: (name, config) =>
        new QwikSSRDevEnvironment(name, config),
    },
  },
}
```

### Plugin Scoping with applyToEnvironment

From Nuxt, the `applyToEnvironment` hook allows plugins to target specific environments:

```typescript
// Optimizer plugin scoped to client only
{
  name: 'qwik:optimizer',
  applyToEnvironment: (environment) => environment.name === 'client',
  transform(code, id) {
    // Only runs for client environment
  },
}

// Conditional scoping with plugin transformation
{
  name: 'qwik:ssr-externals',
  applyToEnvironment(environment) {
    if (environment.name !== 'ssr') return false;
    // Return transformed plugin for SSR
    return {
      name: 'qwik:ssr-externals:transformed',
      resolveId(id) { /* SSR-specific resolution */ },
    };
  },
}
```

### Per-Environment Configuration with configEnvironment

```typescript
{
  name: 'qwik:environments',
  configEnvironment(name, config) {
    if (name === 'client') {
      // Client-specific optimizeDeps
      config.optimizeDeps ||= {};
      config.optimizeDeps.exclude = ['@qwik.dev/core'];
    }
    if (name === 'ssr') {
      // SSR-specific resolve
      config.resolve ||= {};
      config.resolve.noExternal = ['@qwik.dev/core'];
    }
  },
}
```

### Custom DevEnvironment Classes (Optional)

Based on Nitro and Cloudflare patterns, custom DevEnvironment classes provide:

- Request dispatch for SSR
- Custom cleanup logic
- Environment-specific state

```typescript
// packages/qwik/src/optimizer/src/plugins/environment.ts
import { DevEnvironment } from 'vite';

export class QwikSSRDevEnvironment extends DevEnvironment {
  private qrlCache = new Map<string, TransformModule>();

  async dispatchRequest(request: Request): Promise<Response> {
    // SSR request handling
    const url = new URL(request.url).pathname;
    const mod = await this.runner.import(url);
    return mod.default(request);
  }

  async close() {
    this.qrlCache.clear();
    await super.close();
  }
}
```

### Factory Pattern for Environment Creation

From vite-environment-examples, use a static factory for clean environment instantiation:

```typescript
export class QwikDevEnvironment extends DevEnvironment {
  private options: QwikEnvironmentOptions;

  constructor(
    options: QwikEnvironmentOptions,
    name: string,
    config: ResolvedConfig
  ) {
    super(name, config, { hot: true });
    this.options = options;
  }

  // Factory method for config usage
  static createFactory(options: QwikEnvironmentOptions) {
    return (name: string, config: ResolvedConfig) => {
      return new QwikDevEnvironment(options, name, config);
    };
  }
}

// Usage in config
dev: {
  createEnvironment: QwikDevEnvironment.createFactory({
    target: 'client',
    entryStrategy: { type: 'segment' },
  }),
}
```

**Recommendation:** Start without custom classes, add if needed for specific features.

## Migration Phases

### Phase 1: Feature Flag & Configuration (Week 1-2)

**Goal:** Enable Environment API behind flag without breaking changes.

**Changes:**

1. Add feature flag:

```typescript
// types.ts
interface QwikVitePluginOptions {
  experimental?: {
    viteEnvironmentApi?: boolean;
  };
}
```

2. Conditional environment config:

```typescript
// vite.ts
async config(viteConfig, viteEnv) {
  const useEnvApi = qwikViteOpts.experimental?.viteEnvironmentApi;

  const baseConfig = { /* existing config */ };

  if (useEnvApi) {
    return {
      ...baseConfig,
      environments: {
        client: createClientEnvironment(opts),
        ssr: createSSREnvironment(opts),
      },
    };
  }

  return baseConfig;
}
```

**Tests:**

- [ ] Existing tests pass with flag off
- [ ] Basic build works with flag on
- [ ] Environment config is generated correctly

---

### Phase 2: Transform Hook Migration (Week 2-3)

**Goal:** Make transform hook environment-aware.

**Current:**

```typescript
const isServer = devServer ? !!viteOpts?.ssr : opts.target === 'ssr';
```

**Proposed:**

```typescript
transform(code, id) {
  const useEnvApi = this.environment !== undefined;
  const isServer = useEnvApi
    ? this.environment.config.consumer === 'server'
    : (devServer ? !!viteOpts?.ssr : opts.target === 'ssr');

  // Rest of transform logic unchanged
}
```

**Key Pattern (from VitePress/Astro):**

```typescript
transform(code, id) {
  // Environment guard - only process in relevant environment
  if (this.environment?.name === 'client') {
    return this.clientTransform(code, id);
  }
  if (this.environment?.name === 'ssr') {
    return this.serverTransform(code, id);
  }
  // Fallback for legacy mode
  return this.legacyTransform(code, id, isServer);
}
```

**Tests:**

- [ ] Transform output matches between modes
- [ ] QRL extraction works in both environments
- [ ] Code stripping (client/server) works correctly

---

### Phase 3: Module Graph Migration (Week 3-4)

**Goal:** Use environment-scoped module graphs.

**Current:**

```typescript
ctx.server.moduleGraph.getModuleById(key);
ctx.server.moduleGraph.invalidateModule(mod);
```

**Proposed:**

```typescript
// Helper function for compatibility
function getModuleGraph(ctx: PluginContext | HotUpdateContext) {
  if ('environment' in ctx && ctx.environment) {
    return ctx.environment.moduleGraph;
  }
  // Legacy fallback
  return ctx.server?.moduleGraph;
}

// Usage
const graph = getModuleGraph(this);
graph.getModuleById(key);
graph.invalidateModule(mod);
```

**Per-Environment State (from VitePress):**

```typescript
const envState = new WeakMap<Environment, QwikEnvState>();

function getState(env: Environment): QwikEnvState {
  if (!envState.has(env)) {
    envState.set(env, {
      transformedOutputs: new Map(),
      qrlResults: new Map(),
    });
  }
  return envState.get(env)!;
}
```

**Metadata Cache Invalidation (from Astro):**

Track QRL dependencies for proper cascade invalidation:

```typescript
// Track which files affect which QRL metadata
interface QRLMetadata {
  qrls: QRL[];
  dependencies: Set<string>;  // Files this QRL depends on
}

const qrlMetadataCache = new Map<string, QRLMetadata>();

// During transform, record dependencies
transform(code, id) {
  const result = await this.extractQRLs(code, id);

  qrlMetadataCache.set(id, {
    qrls: result.qrls,
    dependencies: new Set(result.imports),
  });

  return result.code;
}

// During hotUpdate, invalidate affected QRL metadata
hotUpdate({ file }) {
  if (this.environment.name !== 'client') return;

  // Check if this file is a dependency of any QRL
  for (const [sourceFile, metadata] of qrlMetadataCache) {
    if (metadata.dependencies.has(file)) {
      // Invalidate the source file's QRL metadata
      qrlMetadataCache.delete(sourceFile);

      // Also invalidate in module graph
      const mod = this.environment.moduleGraph.getModuleById(sourceFile);
      if (mod) {
        this.environment.moduleGraph.invalidateModule(mod);
      }
    }
  }
}
```

**Tests:**

- [ ] Module invalidation works per environment
- [ ] QRL segments tracked correctly per environment
- [ ] No cross-environment pollution
- [ ] Dependency changes cascade to QRL metadata

---

### Phase 4: HMR Migration (Week 4-5)

**Goal:** Migrate from `handleHotUpdate` to `hotUpdate`.

**Current:**

```typescript
handleHotUpdate(ctx) {
  qwikPlugin.handleHotUpdate(ctx);
  if (ctx.modules.length) {
    ctx.server.hot.send({ type: 'full-reload' });
  }
}
```

**Proposed (based on Astro pattern):**

```typescript
hotUpdate: {
  order: 'post',
  handler({ file, modules, server, timestamp }) {
    // Guard for environment
    if (this.environment.name === 'ssr') {
      // SSR-only changes might not need client reload
      return this.handleSSRHotUpdate(modules, server);
    }

    // Client environment
    const state = getState(this.environment);

    for (const mod of modules) {
      if (mod.id) {
        state.qrlResults.delete(mod.id);

        // Invalidate related QRL segments
        for (const [key, [_, parentId]] of state.transformedOutputs) {
          if (parentId === mod.id) {
            state.transformedOutputs.delete(key);
            const qrlMod = this.environment.moduleGraph.getModuleById(key);
            if (qrlMod) {
              this.environment.moduleGraph.invalidateModule(qrlMod);
            }
          }
        }
      }
    }

    // Check if we can do granular HMR
    if (this.canDoGranularHMR(modules)) {
      return modules; // Let Vite handle HMR
    }

    // Fallback to full reload
    this.environment.hot.send({ type: 'full-reload' });
    return [];
  },
},
```

**Potential HMR Improvement:**

```typescript
canDoGranularHMR(modules: EnvironmentModuleNode[]): boolean {
  for (const mod of modules) {
    // If module has QRLs, check if they're style-only
    const metadata = this.getModuleMetadata(mod.id);
    if (metadata?.hasComponentQRLs) {
      return false; // Component changes need reload
    }
    if (metadata?.hasEventQRLs) {
      // Event handlers might be hot-replaceable
      return true;
    }
  }
  return true;
}
```

**Custom HMR Events (from VitePress):**

Instead of full-reload, send granular updates for QRL changes:

```typescript
hotUpdate({ file, modules }) {
  if (this.environment.name !== 'client') return;

  // Check if only QRL metadata changed
  if (this.isQRLMetadataChange(file)) {
    const qrlData = this.getQRLData(file);

    // Send custom event instead of full reload
    this.environment.hot.send({
      type: 'custom',
      event: 'qwik:qrl-update',
      data: { file, qrls: qrlData },
    });

    return []; // Prevent default HMR
  }
}

// Client-side handler
if (import.meta.hot) {
  import.meta.hot.on('qwik:qrl-update', (payload) => {
    // Update QRL references without full reload
    qwikLoader.updateQRLs(payload.qrls);
  });
}
```

**Cascade to Importers (from VitePress):**

Use `mod.importers` to propagate HMR to dependent modules:

```typescript
hotUpdate({ file, modules: existingMods }) {
  if (this.environment.name !== 'client') return;

  const modules: EnvironmentModuleNode[] = [...existingMods];

  for (const mod of existingMods) {
    // Also invalidate modules that import this one
    for (const importer of mod.importers) {
      if (!modules.includes(importer)) {
        modules.push(importer);
        // Clear any cached state for the importer
        this.clearModuleState(importer.id);
      }
    }
  }

  return modules;
}
```

**Tests:**

- [ ] HMR triggers correctly for file changes
- [ ] QRL segments invalidated properly
- [ ] No duplicate reloads
- [ ] SSR changes handled correctly
- [ ] Custom events received by client
- [ ] Importer cascade works correctly

---

### Phase 5: Build Pipeline Migration (Week 5-6)

**Goal:** Use `builder.buildApp()` for coordinated builds.

**Current:**

- Separate `vite build` commands for client and SSR
- Manifest written to disk between builds

**Proposed:**

```typescript
// vite.config.ts
{
  builder: {
    async buildApp(builder) {
      // Build client first (generates manifest)
      await builder.build(builder.environments.client);

      // Build SSR second (consumes manifest)
      await builder.build(builder.environments.ssr);
    },
  },
}
```

**Manifest Sharing:**

```typescript
// Plugin-level state
let clientManifest: QwikManifest | null = null;

// Client build
generateBundle: {
  handler(_, bundle) {
    if (this.environment.name === 'client') {
      clientManifest = generateManifest(bundle);
    }
  },
}

// SSR build
buildStart() {
  if (this.environment.name === 'ssr' && clientManifest) {
    this.qwikManifest = clientManifest;
  }
}
```

**Tests:**

- [ ] Client build completes first
- [ ] Manifest available for SSR build
- [ ] Final output matches expected structure

---

### Phase 6: Router Plugin Migration (Week 6-7)

**Goal:** Update qwik-router to use Environment API.

**Current (already partially using):**

```typescript
const graph = server.environments?.ssr?.moduleGraph;
if (graph) {
  const mod = graph.getModuleById('@qwik-router-config');
  if (mod) {
    graph.invalidateModule(mod);
  }
}
```

**Proposed:**

```typescript
// Full environment integration
configureServer(server) {
  server.watcher.on('change', (path) => {
    if (this.isRouteFile(path)) {
      ctx.isDirty = true;

      // Invalidate in both environments
      for (const env of Object.values(server.environments)) {
        const mod = env.moduleGraph.getModuleById('@qwik-router-config');
        if (mod) {
          env.moduleGraph.invalidateModule(mod);
        }
      }
    }
  });
}

hotUpdate({ file }) {
  if (this.environment.name !== 'client') return;

  if (this.isRouteFile(file)) {
    // Route changes need full invalidation
    this.environment.moduleGraph.invalidateAll();
    this.environment.hot.send({ type: 'full-reload' });
    return [];
  }
}
```

**Tests:**

- [ ] Route file changes trigger rebuild
- [ ] Router config regenerated correctly
- [ ] Both environments updated

---

### Phase 7: Documentation & Deprecation (Week 7-8)

**Goal:** Document migration and deprecate legacy mode.

1. **User Documentation:**
   - Migration guide for custom plugins
   - New configuration options
   - Breaking changes (if any)

2. **Deprecation Warnings:**

```typescript
if (!useEnvApi) {
  console.warn(
    '[qwik] Legacy Vite configuration detected. ' +
      'Enable `experimental.viteEnvironmentApi` for better performance. ' +
      'This will become the default in Qwik 3.0.'
  );
}
```

3. **Update Starters:**
   - Enable flag in new projects
   - Update documentation

---

## Risk Mitigation

### Backward Compatibility

- Feature flag ensures opt-in adoption
- Legacy code paths maintained until Qwik 3.0
- Test suite runs both modes

### Performance

- Monitor build times with new API
- Profile memory usage per environment
- Benchmark HMR response times

### Ecosystem Compatibility

- Test with major adapters (Cloudflare, Node, Deno)
- Verify Qwik React integration
- Test with common Vite plugins

## Timeline Summary

| Phase           | Duration | Milestone                           |
| --------------- | -------- | ----------------------------------- |
| 1. Feature Flag | Week 1-2 | Basic environment config works      |
| 2. Transform    | Week 2-3 | Environment-aware transforms        |
| 3. Module Graph | Week 3-4 | Per-environment module tracking     |
| 4. HMR          | Week 4-5 | hotUpdate hook working              |
| 5. Build        | Week 5-6 | Coordinated multi-environment build |
| 6. Router       | Week 6-7 | Router plugin migrated              |
| 7. Docs         | Week 7-8 | Documentation complete              |

**Total: ~8 weeks for full migration**

## Success Metrics

1. **Functionality:** All tests pass in both modes
2. **Performance:** Build time within 10% of current
3. **DX:** HMR response time maintained or improved
4. **Adoption:** Enable by default in Qwik 2.x, required in 3.0

## Open Questions

1. **Custom DevEnvironment?**
   - Benefit: Cleaner API for SSR request handling, factory pattern
   - Cost: More code to maintain
   - Recommendation: Start without, add if needed
   - Pattern documented: Factory pattern with `static createFactory()`

2. **Granular HMR?**
   - Benefit: Better DX, faster refresh
   - Cost: Complexity in determining what can be hot-replaced
   - Recommendation: Implement basic version, improve over time
   - Patterns documented: Custom HMR events, importer cascade, metadata invalidation

3. **Worker Environment?**
   - Benefit: Support web workers with same API
   - Cost: Additional environment to maintain
   - Recommendation: Defer to future release
   - Reference: vite-environment-examples has workerd implementation

4. **applyToEnvironment vs Environment Guards?**
   - `applyToEnvironment`: Scopes entire plugin to environment (Nuxt pattern)
   - Environment guards: `if (this.environment.name !== 'client') return`
   - Recommendation: Use `applyToEnvironment` for clearly-scoped plugins,
     guards for hooks that need access to multiple environments

5. **configEnvironment Hook?**
   - Benefit: Per-environment config without duplicating plugin
   - Cost: Additional hook to understand
   - Recommendation: Use for environment-specific optimizeDeps, resolve conditions

---

## Exact Code Changes

> **For Claude/AI Implementation:** This section provides exact code changes needed. Follow patterns precisely - backward compatibility is critical.

### Files to Modify

| File                                                | Changes                                                |
| --------------------------------------------------- | ------------------------------------------------------ |
| `packages/qwik/src/optimizer/src/plugins/vite.ts`   | Add environments config, hotUpdate hook                |
| `packages/qwik/src/optimizer/src/plugins/plugin.ts` | Update getIsServer, expose outputs, add compat helpers |
| `packages/qwik-router/src/buildtime/vite/plugin.ts` | Update invalidation, add hotUpdate hook                |

---

### Critical Compatibility Patterns

#### 1. Feature Flag Check

All changes must be gated:

```typescript
// Check if Environment API is available and enabled
const useEnvApi =
  qwikViteOpts.experimental?.viteEnvironmentApi && typeof this.environment !== 'undefined';
```

#### 2. Environment Detection (Backward Compatible)

```typescript
// Old (Vite 5)
const isServer = devServer ? !!viteOpts?.ssr : opts.target === 'ssr';

// New (with backward compat)
const isServer = this.environment
  ? this.environment.config.consumer === 'server'
  : devServer
    ? !!viteOpts?.ssr
    : opts.target === 'ssr';
```

#### 3. Module Graph Access (Backward Compatible)

```typescript
function getModuleGraph(ctx: any, envName?: string) {
  // New API: use environment-specific graph
  if (ctx.environment?.moduleGraph) {
    return ctx.environment.moduleGraph;
  }
  // Fallback: access via server.environments
  if (ctx.server?.environments?.[envName || 'ssr']?.moduleGraph) {
    return ctx.server.environments[envName].moduleGraph;
  }
  // Legacy: single shared graph
  return ctx.server?.moduleGraph;
}
```

#### 4. Keep Both HMR Hooks

**Do NOT remove `handleHotUpdate`** - add `hotUpdate` alongside it:

```typescript
// Keep existing (for Vite 5 compat)
handleHotUpdate(ctx) {
  qwikPlugin.handleHotUpdate(ctx);
  if (ctx.modules.length) {
    ctx.server.hot.send({ type: 'full-reload' });
  }
},

// Add new (for Vite 6+)
hotUpdate: {
  order: 'post',
  handler({ file, modules, server, timestamp }) {
    if (!qwikViteOpts.experimental?.viteEnvironmentApi) {
      return; // Let handleHotUpdate handle it
    }
    if (this.environment.name !== 'client') return;
    // ... environment-specific logic
  }
},
```

---

### File 1: vite.ts Changes

#### Location: `packages/qwik/src/optimizer/src/plugins/vite.ts`

**Change 1: Add Environment Config (in `config()` hook, before return)**

```typescript
// Around line 356, before `return updatedViteConfig`
if (qwikViteOpts.experimental?.viteEnvironmentApi) {
  (updatedViteConfig as any).environments = {
    client: {
      consumer: 'client',
      resolve: {
        conditions: ['browser', 'import', 'module'],
      },
      optimizeDeps: {
        exclude: [
          QWIK_CORE_ID,
          QWIK_CORE_INTERNAL_ID,
          QWIK_CORE_SERVER,
          QWIK_JSX_RUNTIME_ID,
          QWIK_JSX_DEV_RUNTIME_ID,
          QWIK_BUILD_ID,
          QWIK_CLIENT_MANIFEST_ID,
        ],
      },
    },
    ssr: {
      consumer: 'server',
      resolve: {
        conditions: ['node', 'import', 'module'],
        noExternal: [QWIK_CORE_ID, QWIK_CORE_INTERNAL_ID, QWIK_CORE_SERVER, QWIK_BUILD_ID],
      },
    },
  };
}
```

**Change 2: Add hotUpdate Hook (in `vitePluginPost`, after `handleHotUpdate`)**

```typescript
// Around line 596, after handleHotUpdate
hotUpdate: {
  order: 'post',
  handler({ file, modules, server, timestamp }) {
    // Only use new API when feature flag is enabled
    if (!qwikViteOpts.experimental?.viteEnvironmentApi) {
      return;
    }

    const envName = this.environment?.name;
    if (!envName) return;

    // Call plugin's HMR handler
    qwikPlugin.handleHotUpdate({
      file,
      modules,
      server,
      read: () => Promise.resolve(''),
    } as any);

    if (modules.length) {
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    }
  },
},
```

---

### File 2: plugin.ts Changes

#### Location: `packages/qwik/src/optimizer/src/plugins/plugin.ts`

**Change 1: Update `getIsServer` (around line 436)**

```typescript
// Change from:
const getIsServer = (viteOpts?: { ssr?: boolean }) => {
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
};

// Change to:
const getIsServer = (viteOpts?: { ssr?: boolean }, environment?: any) => {
  // New Environment API check
  if (environment?.config?.consumer === 'server') {
    return true;
  }
  if (environment?.name === 'ssr') {
    return true;
  }
  // Legacy fallback
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
};
```

**Change 2: Update transform() call (around line 729)**

```typescript
// Change from:
const isServer = getIsServer(transformOpts);

// Change to:
// @ts-ignore - this.environment may not exist in older Vite
const isServer = getIsServer(transformOpts, (this as any).environment);
```

**Change 3: Expose transform outputs (around line 1127 in return object)**

```typescript
return {
  // ... existing methods ...

  // Add these for Environment API HMR
  getClientTransformedOutputs: () => clientTransformedOutputs,
  getServerTransformedOutputs: () => serverTransformedOutputs,
};
```

---

### File 3: Router plugin.ts Changes

#### Location: `packages/qwik-router/src/buildtime/vite/plugin.ts`

**Change 1: Update module graph access (around line 181)**

```typescript
// Change from:
const graph = server.environments?.ssr?.moduleGraph;
if (graph) {
  const mod = graph.getModuleById('@qwik-router-config');
  if (mod) {
    graph.invalidateModule(mod);
  }
}

// Change to:
const environments = server.environments
  ? Object.values(server.environments)
  : [{ moduleGraph: server.moduleGraph }];

for (const env of environments) {
  const graph = (env as any).moduleGraph;
  if (graph) {
    const mod = graph.getModuleById('@qwik-router-config');
    if (mod) {
      graph.invalidateModule(mod);
    }
  }
}
```

**Change 2: Add hotUpdate hook (after transformIndexHtml, around line 203)**

```typescript
hotUpdate: {
  order: 'post',
  handler({ file, modules }) {
    if (this.environment?.name !== 'client') return;

    if (!/\/(index[.@]|layout[.-]|entry\.|service-worker\.)[^/]*$/.test(file)) {
      return;
    }

    ctx!.isDirty = true;

    const mod = this.environment.moduleGraph.getModuleById('@qwik-router-config');
    if (mod) {
      this.environment.moduleGraph.invalidateModule(mod);
    }

    this.environment.hot.send({ type: 'full-reload' });
    return [];
  },
},
```

---

## Testing Checklist

### Backward Compatibility (Flag OFF)

```bash
# Run without flag - everything should work as before
pnpm build
pnpm test
pnpm dev  # Test HMR
```

- [ ] Build completes without errors
- [ ] All tests pass
- [ ] Dev server HMR works
- [ ] Production builds work

### New API (Flag ON)

Add to vite.config.ts:

```typescript
qwikVite({
  experimental: ['viteEnvironmentApi'],
});
```

- [ ] Dev server starts
- [ ] HMR triggers on file changes
- [ ] QRL segments invalidated correctly
- [ ] No cross-environment pollution
- [ ] Production build works

---

## Common Mistakes to Avoid

1. **Don't remove `handleHotUpdate`** - Keep both hooks for backward compatibility

2. **Don't assume `this.environment` exists** - Always check:

   ```typescript
   if (this.environment?.name) { ... }
   ```

3. **Don't use `server.moduleGraph` directly with new API** - Use environment graph:

   ```typescript
   // Wrong
   server.moduleGraph.getModuleById(id);

   // Right
   this.environment.moduleGraph.getModuleById(id);
   ```

4. **Don't send HMR to wrong channel** - Use `this.environment.hot`, not `server.hot`

5. **Always add environment guard first**:
   ```typescript
   if (this.environment.name !== 'client') return;
   ```

---

## References

- [01-vite-core-api.md](./01-vite-core-api.md) - Vite Environment API fundamentals
- [02-nitro-implementation.md](./02-nitro-implementation.md) - FetchableDevEnvironment pattern
- [03-cloudflare-workers.md](./03-cloudflare-workers.md) - Custom runtime environment
- [04-reference-implementations.md](./04-reference-implementations.md) - Factory patterns
- [05-vitepress-patterns.md](./05-vitepress-patterns.md) - HMR and module graph patterns
- [06-nuxt-implementation.md](./06-nuxt-implementation.md) - Feature flag approach
- [07-astro-implementation.md](./07-astro-implementation.md) - Cross-environment module lookup
- [08-qwik-requirements.md](./08-qwik-requirements.md) - Qwik-specific needs
