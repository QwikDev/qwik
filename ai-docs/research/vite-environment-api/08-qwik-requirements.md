# Qwik-Specific Requirements for Environment API Migration

## Current Architecture

### Plugin Structure

Qwik has two main Vite plugins:

1. **qwikVite()** - Core optimizer plugin (`packages/qwik/src/optimizer/src/plugins/vite.ts`)
   - QRL extraction and transformation
   - Manifest generation
   - Dev server configuration

2. **qwikRouter()** - Routing plugin (`packages/qwik-router/src/buildtime/vite/plugin.ts`)
   - File-based routing
   - Route code generation
   - MDX transformation

### Target-Based Architecture

Currently, Qwik uses `opts.target` to differentiate builds:

```typescript
type QwikBuildTarget = 'client' | 'ssr' | 'lib' | 'test';
```

**Key usages in plugin.ts:**

| Location        | Purpose                                       |
| --------------- | --------------------------------------------- |
| Line ~197-206   | Set target from config (`normalizeOptions`)   |
| Line ~221-232   | Entry strategy per target                     |
| Line ~254-266   | Input files per target                        |
| Line ~274-285   | Output directory per target                   |
| Line ~436-438   | `getIsServer()` - Determine if SSR transform  |
| Line ~746-802   | Strip client/server code based on target      |
| Line ~829-836   | Emit QRL files (client only, non-dev)         |
| Line ~960-1006  | Load manifest (`getQwikServerManifestModule`) |
| Line ~1037-1076 | Manual chunks (client only)                   |

**Key usages in vite.ts:**

| Location      | Purpose                                  |
| ------------- | ---------------------------------------- |
| Line ~111-119 | Determine target from viteConfig/viteEnv |
| Line ~296-354 | Build configuration per target           |
| Line ~452-508 | Manifest generation (`generateBundle`)   |
| Line ~586-596 | HMR handling (`handleHotUpdate`)         |

### Transform Pipeline

```
Source File (.tsx)
       │
       ▼
┌─────────────────────────────────────┐
│  Qwik Optimizer Transform           │
│  ├─ Extract QRLs ($, component$)    │
│  ├─ Strip server code (client)      │
│  ├─ Strip client code (server)      │
│  └─ Generate segment imports        │
└─────────────────────────────────────┘
       │
       ├──► Client Build: QRL segments as entry points
       │
       └──► SSR Build: References to QRL segments
```

### Key Data Structures (plugin.ts)

```typescript
// Line ~90-94 - Transform result caching
const clientResults = new Map<string, TransformOutput>();
const clientTransformedOutputs = new Map<string, [TransformModule, string]>();
const serverTransformedOutputs = new Map<string, [TransformModule, string]>();
const parentIds = new Map<string, string>(); // QRL segment -> parent file
```

**These maps need environment-aware handling:**

- `clientTransformedOutputs` / `serverTransformedOutputs` - already separated
- `clientResults` - transform outputs for manifest generation
- `parentIds` - maps QRL segments back to parent files for resolution

### Code Stripping Configuration

```typescript
// Line ~28-57 - What gets stripped per environment
const SERVER_STRIP_EXPORTS = [
  'onGet',
  'onPost',
  'onPut',
  'onRequest',
  'onDelete',
  'onHead',
  'onOptions',
  'onPatch',
  'onStaticGenerate',
];

const SERVER_STRIP_CTX_NAME = [
  'useServer',
  'route',
  'server',
  'action$',
  'loader$',
  'zod$',
  'validator$',
  'globalAction$',
];

const CLIENT_STRIP_CTX_NAME = [
  'useClient',
  'useBrowser',
  'useVisibleTask',
  'client',
  'browser',
  'event$',
];
```

### HMR Current State

```typescript
// vite.ts:586-596 - Entry point in vitePluginPost
handleHotUpdate(ctx) {
  qwikPlugin.handleHotUpdate(ctx);

  // Tell the client to reload the page if any modules were used in ssr or client
  // this needs to be refined
  if (ctx.modules.length) {
    ctx.server.hot.send({
      type: 'full-reload',
    });
  }
}

// plugin.ts:1013-1035 - Core HMR logic
function handleHotUpdate(ctx: HmrContext) {
  debug('handleHotUpdate()', ctx.file);

  for (const mod of ctx.modules) {
    const { id } = mod;
    if (id) {
      debug('handleHotUpdate()', `invalidate ${id}`);
      clientResults.delete(id);
      // Invalidate related QRL segments
      for (const outputs of [clientTransformedOutputs, serverTransformedOutputs]) {
        for (const [key, [_, parentId]] of outputs) {
          if (parentId === id) {
            debug('handleHotUpdate()', `invalidate ${id} segment ${key}`);
            outputs.delete(key);
            const mod = ctx.server.moduleGraph.getModuleById(key);
            if (mod) {
              ctx.server.moduleGraph.invalidateModule(mod);
            }
          }
        }
      }
    }
  }
}
```

**Current limitations:**

1. Always triggers full-reload (comment says "this needs to be refined")
2. Uses shared `ctx.server.moduleGraph` instead of per-environment graphs
3. Invalidates both client and server outputs regardless of which changed

**Router plugin already uses Environment API partially:**

```typescript
// qwik-router/plugin.ts:181-188
const graph = server.environments?.ssr?.moduleGraph;
if (graph) {
  const mod = graph.getModuleById('@qwik-router-config');
  if (mod) {
    graph.invalidateModule(mod);
  }
}
```

## Requirements for Environment API Migration

### 1. Environment Configuration

```typescript
// Proposed configuration
environments: {
  client: {
    consumer: 'client',
    resolve: {
      conditions: ['browser', 'import'],
    },
    dev: {
      createEnvironment: (name, config) => {
        return new QwikClientDevEnvironment(name, config);
      },
    },
    build: {
      rollupOptions: {
        input: clientEntries,  // QRL segments
        output: {
          // Qwik-specific output naming
        },
      },
    },
  },

  ssr: {
    consumer: 'server',
    resolve: {
      conditions: ['node', 'import'],
      noExternal: ['@qwik.dev/core', ...],
    },
    dev: {
      createEnvironment: (name, config) => {
        return new QwikSSRDevEnvironment(name, config);
      },
    },
    build: {
      ssr: true,
      rollupOptions: {
        input: ssrEntry,
      },
    },
  },
}
```

### 2. Environment-Aware Transform

```typescript
// Vite 7+ Environment API detection with Rolldown fallback
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

**Note:** Rolldown compatibility is maintained via the `opts.target` fallback. Rolldown doesn't have a dev server, so when `environment` is undefined, we fall back to checking the build target.

### 3. QRL Tracking Per Environment

```typescript
// Current: Single maps for both environments
const clientTransformedOutputs = new Map<string, [TransformModule, string]>();
const serverTransformedOutputs = new Map<string, [TransformModule, string]>();

// Proposed: Environment-keyed maps
const transformedOutputs = new Map<Environment, Map<string, [TransformModule, string]>>();

// Or use WeakMap pattern (like VitePress)
function getEnvironmentState(env: Environment) {
  if (!stateMap.has(env)) {
    stateMap.set(env, { outputs: new Map(), results: new Map() });
  }
  return stateMap.get(env);
}
```

### 4. hotUpdate Migration

```typescript
// Current (deprecated)
handleHotUpdate(ctx) {
  // Single callback, uses ctx.server.moduleGraph
}

// Proposed
hotUpdate({ file, modules, timestamp }) {
  // Guard for environment
  if (this.environment.name !== 'client') {
    // SSR might need different handling
    return;
  }

  const state = getEnvironmentState(this.environment);

  for (const mod of modules) {
    if (mod.id) {
      state.results.delete(mod.id);

      // Invalidate related QRL segments in THIS environment
      for (const [key, [_, parentId]] of state.outputs) {
        if (parentId === mod.id) {
          state.outputs.delete(key);
          const qrlMod = this.environment.moduleGraph.getModuleById(key);
          if (qrlMod) {
            this.environment.moduleGraph.invalidateModule(qrlMod);
          }
        }
      }
    }
  }

  // Consider more granular HMR instead of full-reload
  // Check if change affects only styles, only QRLs, etc.
}
```

### 5. Manifest Generation

```typescript
// Current: Generated in client build, consumed in SSR
async generateBundle(_, rollupBundle) {
  if (opts.target === 'client') {
    await qwikPlugin.generateManifest(this, rollupBundle, ...);
  }
}

// Proposed: Environment-aware
generateBundle: {
  order: 'post',
  async handler(_, rollupBundle) {
    if (this.environment.name === 'client') {
      await generateManifest(this.environment, rollupBundle, ...);
    }
  },
}
```

### 6. Module Graph Access

```typescript
// Current
ctx.server.moduleGraph.getModuleById(key);
ctx.server.moduleGraph.invalidateModule(mod);

// Proposed
this.environment.moduleGraph.getModuleById(key);
this.environment.moduleGraph.invalidateModule(mod);
```

### 7. Dev Server Middleware

```typescript
// Current (qwik-router plugin.ts:165-196)
configureServer(server) {
  server.watcher.add(toWatch);
  server.watcher.on('change', (path) => {
    ctx.isDirty = true;
    // Invalidate router config
    const graph = server.environments?.ssr?.moduleGraph;
    if (graph) {
      const mod = graph.getModuleById('@qwik-router-config');
      if (mod) {
        graph.invalidateModule(mod);
      }
    }
  });
}

// Already partially using environments API!
// Just needs cleanup and consistency
```

## Unique Qwik Challenges

### 1. QRL Segment Entry Points

Qwik extracts QRLs as separate entry points during transform:

```typescript
// Current approach
if (opts.target === 'client' && !devServer) {
  ctx.emitFile({
    id: key, // QRL segment ID
    type: 'chunk',
  });
}
```

**Challenge:** How to handle dynamic QRL entries with Environment API?

**Options:**

1. Emit all QRLs from client environment transform
2. Use `builder.buildApp()` to coordinate builds
3. Pre-scan QRLs before build

### 2. Cross-Environment Manifest

The manifest generated in client build is consumed in SSR:

```typescript
// Client build generates
const manifest: QwikManifest = { bundles, symbols, ... };

// SSR build consumes
const manifestInput = opts.manifestInput || loadManifestFromDisk();
```

**Challenge:** Environment API doesn't have built-in cross-environment communication.

**Options:**

1. Write manifest to disk (current approach)
2. Use `builder.buildApp()` to share state between builds
3. Use plugin-level state with `buildStart`/`buildEnd` hooks

### 3. Optimizer Integration

Qwik's Rust-based optimizer does the heavy lifting (plugin.ts:776-806):

```typescript
const transformOpts: TransformModulesOptions = {
  input: [{ code, path: filePath, devPath }],
  entryStrategy: isServer ? { type: 'hoist' } : entryStrategy,
  minify: 'simplify',
  sourceMaps: opts.sourcemap || 'development' === opts.buildMode,
  transpileTs: true,
  transpileJsx: true,
  explicitExtensions: true,
  preserveFilenames: true,
  srcDir,
  rootDir: opts.rootDir,
  mode,
  scope: opts.scope || undefined,
  isServer, // <-- This is the key: optimizer IS environment-aware
};

// Code stripping based on isServer
if (strip) {
  if (isServer) {
    transformOpts.stripCtxName = CLIENT_STRIP_CTX_NAME;
    transformOpts.stripEventHandlers = true;
    transformOpts.regCtxName = REG_CTX_NAME;
  } else {
    transformOpts.stripCtxName = SERVER_STRIP_CTX_NAME;
    transformOpts.stripExports = SERVER_STRIP_EXPORTS;
  }
}

const newOutput = await optimizer.transformModules(transformOpts);
```

**Key insight:** The optimizer already receives `isServer` - we just need to derive it from `this.environment` instead of `opts.target`.

**Recommendation:** Keep optimizer environment-agnostic, pass `isServer` from JS layer.

### 4. Dev vs Build Behavior

```typescript
// Dev mode
if (viteCommand === 'serve') {
  qwikViteOpts.entryStrategy = { type: 'segment' };
}

// Build mode
if (target === 'ssr') {
  qwikViteOpts.entryStrategy = { type: 'hoist' };
}
```

**Challenge:** Entry strategy differs between dev and build, and between environments.

### 5. Router Plugin Coordination

The router plugin depends on the core plugin:

```typescript
// Router needs core plugin's API
qwikPlugin = config.plugins.find((p) => p.name === 'vite-plugin-qwik');
qwikPlugin.api.registerBundleGraphAdder?.((manifest) => {
  return getRouteImports(ctx.routes, manifest);
});
```

**Challenge:** Both plugins need environment awareness, and must coordinate.

## Version Requirements

- **Minimum:** Vite 7.0.0 (Environment API fully stable)
- **Rolldown:** Supported (uses `opts.target` fallback, no Environment API)
- **Vite 5/6:** No longer supported

The Environment API is automatically enabled when running Vite 7+. No experimental flag is needed.

## Migration Phases

Environment configuration is version-gated using `this.meta.viteVersion`:

```typescript
const viteMajorVersion = getViteMajorVersion(this.meta?.viteVersion);
if (viteMajorVersion >= 7) {
  updatedViteConfig.environments = {
    client: {
      /* ... */
    },
    ssr: {
      /* ... */
    },
  };
}
```

### Phase 1: Transform Migration

- Use `this.environment` in hooks when available
- Keep `opts.target` for Rolldown compatibility

### Phase 2: HMR Migration

- Migrate `handleHotUpdate` to `hotUpdate`
- Implement environment-specific HMR

### Phase 3: Module Graph Migration

- Use `this.environment.moduleGraph`
- Update QRL invalidation logic

### Phase 4: Build Pipeline Migration

- Use `builder.buildApp()` for build coordination
- Maintain manifest flow between environments

## Testing Strategy

1. **Unit Tests:** Transform output per environment
2. **Integration Tests:** Full build with both environments
3. **E2E Tests:** Dev server HMR behavior
4. **Snapshot Tests:** Manifest generation
5. **Version Tests:** Verify environments config only present for Vite 7+

## Success Criteria

1. All existing tests pass with Vite 7+
2. Dev server HMR works correctly
3. Production builds generate correct output
4. No regression in build times
5. Rolldown compatibility maintained (REPL/playground)
