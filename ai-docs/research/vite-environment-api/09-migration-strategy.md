# Qwik Vite Environment API Migration Strategy

## Executive Summary

This document outlines the strategy for migrating Qwik's Vite plugins to the Vite 7+ Environment API. Based on research of Nitro, Nuxt, Cloudflare Workers, VitePress, and Astro implementations, we use version detection to automatically enable the Environment API.

### Version Requirements

- **Minimum:** Vite 7.0.0 (Environment API fully stable)
- **Rolldown:** Supported (uses `opts.target` fallback, no Environment API)
- **Vite 5/6:** No longer supported

### Removed

- `experimental.viteEnvironmentApi` flag - no longer needed
- Vite 5/6 backward compatibility code
- `handleHotUpdate` legacy hook (use `hotUpdate` only in Vite 7+)

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

### Phase 1: Version-Gated Environment Configuration

**Goal:** Enable Environment API automatically for Vite 7+ without breaking Rolldown.

**Changes:**

1. Add version detection helper:

```typescript
function getViteMajorVersion(viteVersion: string | undefined): number {
  if (!viteVersion) return 0;
  const major = parseInt(viteVersion.split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}
```

2. Version-gated environment config:

```typescript
// vite.ts config() hook
const viteMajorVersion = getViteMajorVersion(this.meta?.viteVersion);
if (viteMajorVersion >= 7) {
  updatedViteConfig.environments = {
    client: { consumer: 'client' /* ... */ },
    ssr: { consumer: 'server' /* ... */ },
  };
}
```

**Tests:**

- [ ] Environments present with Vite 7.0.0
- [ ] Environments NOT present with Vite 6.0.0
- [ ] Environments NOT present with undefined version (Rolldown)

---

### Phase 2: Transform Hook Migration

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

- Version detection ensures automatic adoption on Vite 7+
- Rolldown fallback maintains REPL/playground functionality
- `opts.target` fallback handles builds without Environment API

### Performance

- Monitor build times with new API
- Profile memory usage per environment
- Benchmark HMR response times

### Ecosystem Compatibility

- Test with major adapters (Cloudflare, Node, Deno)
- Verify Qwik React integration
- Test with common Vite plugins

## Timeline Summary

| Phase             | Duration | Milestone                           |
| ----------------- | -------- | ----------------------------------- |
| 1. Version Detect | Week 1   | Version-gated environment config    |
| 2. Transform      | Week 1-2 | Environment-aware transforms        |
| 3. Module Graph   | Week 2-3 | Per-environment module tracking     |
| 4. HMR            | Week 3-4 | hotUpdate hook working              |
| 5. Build          | Week 4-5 | Coordinated multi-environment build |
| 6. Router         | Week 5-6 | Router plugin migrated              |
| 7. Docs           | Week 6   | Documentation complete              |

**Total: ~6 weeks for full migration**

### Rolldown Support

Rolldown (used in REPL/playground) doesn't have a dev server, so the Environment API isn't available. The fallback detection ensures compatibility:

```typescript
// When environment is undefined (Rolldown), fall back to opts.target
return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
```

This pattern ensures REPL/playground functionality is maintained without changes.

## Success Metrics

1. **Functionality:** All tests pass with Vite 7+
2. **Performance:** Build time within 10% of current
3. **DX:** HMR response time maintained or improved
4. **Compatibility:** Rolldown/REPL builds work without Environment API

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

#### 1. Version Detection

Environment configuration is version-gated, not feature-flagged:

```typescript
// Helper at top of file
function getViteMajorVersion(viteVersion: string | undefined): number {
  if (!viteVersion) return 0;
  const major = parseInt(viteVersion.split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}

// In config() hook
const viteMajorVersion = getViteMajorVersion(this.meta?.viteVersion);
if (viteMajorVersion >= 7) {
  updatedViteConfig.environments = {
    /* ... */
  };
}
```

#### 2. Environment Detection (with Rolldown Fallback)

```typescript
const getIsServer = (viteOpts?: { ssr?: boolean }, environment?: Environment): boolean => {
  // Vite 7+ Environment API
  if (environment?.config?.consumer === 'server') {
    return true;
  }
  // Fallback: check environment.name
  if (environment?.name === 'ssr') {
    return true;
  }
  // Rolldown/build fallback (no dev server, no environment)
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
};
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

#### 4. HMR Hook (Vite 7+ Only)

With Vite 7+ as minimum, use `hotUpdate` exclusively:

```typescript
// Vite 7+ hotUpdate hook
hotUpdate: {
  order: 'post',
  handler({ file, modules, server, timestamp }) {
    if (this.environment.name !== 'client') return;

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

**Note:** The legacy `handleHotUpdate` hook is no longer needed since we require Vite 7+.

---

### File 1: vite.ts Changes

#### Location: `packages/qwik/src/optimizer/src/plugins/vite.ts`

**Change 1: Add Version Detection Helper (at top of file, after DEDUPE)**

```typescript
/**
 * Parse the major version number from a Vite version string. Returns 0 if version is undefined or
 * cannot be parsed.
 */
function getViteMajorVersion(viteVersion: string | undefined): number {
  if (!viteVersion) return 0;
  const major = parseInt(viteVersion.split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}
```

**Change 2: Add Version-Gated Environment Config (in `config()` hook, before return)**

```typescript
/**
 * Vite 7+ Environment API configuration. Provides per-environment module graphs and optimized deps.
 * Only enabled for Vite 7+ where the Environment API is fully stable. Rolldown (used in
 * REPL/playground) doesn't have a dev server and will fall back to opts.target detection in
 * getIsServer().
 */
const viteMajorVersion = getViteMajorVersion(this.meta?.viteVersion);
if (viteMajorVersion >= 7) {
  updatedViteConfig.environments = {
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

---

### File 2: plugin.ts Changes

#### Location: `packages/qwik/src/optimizer/src/plugins/plugin.ts`

**Change 1: Update `getIsServer` with Rolldown-aware comments**

```typescript
const getIsServer = (viteOpts?: { ssr?: boolean }, environment?: Environment): boolean => {
  // Vite 7+ Environment API: Check environment.config.consumer first
  if (environment?.config?.consumer === 'server') {
    return true;
  }
  // Fallback: check environment.name for edge cases
  if (environment?.name === 'ssr') {
    return true;
  }
  // Rolldown/build fallback (no dev server, no Environment API)
  // This handles REPL/playground builds and production builds where
  // the Environment API may not be available
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
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

### Vite 7+ Tests

```bash
# Run with Vite 7+ - Environment API enabled
pnpm build
pnpm test
pnpm dev  # Test HMR
```

- [ ] Build completes without errors
- [ ] All tests pass
- [ ] Dev server HMR works
- [ ] Production builds work
- [ ] Environments config is present

### Rolldown Compatibility Tests

```bash
# Test REPL/playground scenarios (no Environment API)
pnpm test.unit qwik
```

- [ ] Environments config NOT present when viteVersion undefined
- [ ] `getIsServer` falls back to `opts.target`
- [ ] REPL builds work correctly
- [ ] No cross-environment pollution

---

## Common Mistakes to Avoid

1. **Don't assume `this.environment` exists** - Always check (for Rolldown compatibility):

   ```typescript
   if (this.environment?.name) { ... }
   ```

2. **Don't use `server.moduleGraph` directly with new API** - Use environment graph:

   ```typescript
   // Wrong
   server.moduleGraph.getModuleById(id);

   // Right
   this.environment.moduleGraph.getModuleById(id);
   ```

3. **Don't send HMR to wrong channel** - Use `this.environment.hot`, not `server.hot`

4. **Always add environment guard first**:

   ```typescript
   if (this.environment.name !== 'client') return;
   ```

5. **Don't forget Rolldown fallback** - When environment is undefined, fall back to `opts.target`:

   ```typescript
   // Rolldown/build fallback
   return devServer ? !!viteOpts?.ssr : opts.target === 'ssr';
   ```

---

## Team Discussion Notes (Discord, 2025)

### Jack's Analysis of qwikVite Plugin Areas (Aug 2, 2025)

**Specific areas identified for migration:**

| Lines     | Issue                                              | Required Change                                                                |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| 103-150   | Implicit environment handling as boolean (SSR/CSR) | Change `opts.target` to use `this.environment`                                 |
| 103-335   | Uses deprecated `build.ssr` config option          | Update to `environments` config                                                |
| 222-231   | Top-level `ssr` config                             | Move into `environments` object                                                |
| 464-566   | Manifest generation in separate processes          | Refactor - no longer need two separate processes                               |
| 570-618   | Vite dev server in core plugin                     | Move to Qwik Router, use `FetchableDevEnvironment` or `RunnableDevEnvironment` |
| plugin.ts | Old environment checks like `getIsServer`          | Update to check `this.environment`                                             |

### Nitro Integration Patterns (from pi0, Oct 2025)

**How Nitro Vite plugin works:**

1. Infers SSR entry from `environments.ssr.build?.rollupOptions?.input`
2. Sets `config.build.outDir` of client environments based on deployment preset
3. **Dev mode:** Makes SSR a Fetchable environment, calls fetch in isolated worker
4. **Prod mode:** Dynamically imports SSR entry and routes every request to it

**Build ordering:** Nitro plugin waits on all other environments to complete before final server build.

**Performance pattern - FastResponse:**

```typescript
// Instead of converting node → web → node streams:
return new FastResponse(NodeReadable);
// FastResponse can hold a node stream and passthrough without conversion
```

### Build Order Requirement

> "qwik needs the client build to complete before the ssr build completes" — w00t

This is critical for manifest generation. Use `builder.buildApp()` to control order:

```typescript
builder: {
  async buildApp(builder) {
    // Client first (generates manifest)
    await builder.build(builder.environments.client);
    // SSR second (consumes manifest)
    await builder.build(builder.environments.ssr);
  },
}
```

### Environment API Usage Patterns

```typescript
// Get URLs for client module graph (useful for vitest browser SSR)
await viteServer.environments.client.resolveUrl('@qwik.dev/core');

// Pre-generate client code
await viteServer.environments.client.fetchModule(filePath);

// Use module graph for QRL->file mapping
const clientGraph = viteServer.environments.client.moduleGraph;
```

### Known Issues During Migration

1. **"Qwik core bundle not found"** - Occurs when optimizer doesn't find application root
2. **Empty root.tsx** - If root file is empty, optimizer has nothing to process
3. **Manifest generation fails** - Usually due to missing entry points or empty modules

### Development Environment Recommendations

- Use `FetchableDevEnvironment` for SSR (like Nitro) - works with other fetchable runtimes
- `RunnableDevEnvironment` for more control over module execution
- `--app` flag may run out of memory for large builds (docs) - use rolldown for those cases

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

### External Resources (Nitro Integration)

- [nitrojs/vite-examples#9](https://github.com/nitrojs/vite-examples/pull/9) - Giorgio's PR for Qwik + Nitro example
- [nitrojs/nitro#3825](https://github.com/nitrojs/nitro/pull/3825) - Nitro PR with Qwik branch
- [pi0/nitro-qwik](https://github.com/pi0/nitro-qwik) - External test repo for Nitro + Qwik
