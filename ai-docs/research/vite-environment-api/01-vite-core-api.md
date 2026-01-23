# Vite Environment API - Core Concepts

## Overview

Vite 6 introduced the Environment API to formalize the concept of multiple execution contexts within a single Vite server. Previously, Vite implicitly supported two environments (client and SSR) with a boolean `ssr` parameter. The new API allows defining arbitrary environments (browser, Node.js server, edge workers, etc.).

## Key Concepts

### 1. Environment

An **Environment** represents an isolated execution context with its own:

- **Module Graph** - tracks dependencies and transform results
- **Plugin Pipeline** - shared plugins but environment-aware hooks
- **Configuration** - can override top-level config
- **Runtime Executor** - where code actually runs (browser, Node, workerd, etc.)

### 2. Configuration Structure

```typescript
// vite.config.ts
export default {
  // Top-level options apply to all environments by default
  build: { sourcemap: false },

  environments: {
    // 'client' is always present (implicit if not specified)
    client: {
      // Client-specific overrides
    },

    // 'ssr' environment for server-side rendering
    ssr: {
      resolve: {
        conditions: ['node'],
        noExternal: ['some-package'],
      },
    },

    // Custom environments
    edge: {
      resolve: { noExternal: true },
      dev: {
        createEnvironment: (name, config) => {
          return new CustomDevEnvironment(name, config);
        },
      },
    },
  },
};
```

### 3. DevEnvironment Class

The `DevEnvironment` class is the core abstraction for development:

```typescript
class DevEnvironment {
  name: string; // 'client', 'ssr', or custom
  mode: 'dev'; // Always 'dev' for DevEnvironment
  config: ResolvedConfig; // Merged config with env overrides
  moduleGraph: EnvironmentModuleGraph; // Per-environment module tracking
  pluginContainer: PluginContainer; // Executes plugin pipeline
  hot: HotChannel; // HMR communication channel
  depsOptimizer?: DepsOptimizer; // Pre-bundling for this env

  // Core methods
  transformRequest(url: string): Promise<TransformResult>;
  warmupRequest(url: string): Promise<void>;
  reloadModule(module: EnvironmentModuleNode): Promise<void>;
}
```

**Key Properties:**

- `moduleGraph` - Each environment has its own isolated module graph
- `hot` - HMR channel for sending messages to the runtime
- `pluginContainer` - Runs plugins in the context of this environment

### 4. EnvironmentModuleGraph

Replaces the old mixed `ModuleGraph`. Each environment now has a completely isolated graph:

```typescript
class EnvironmentModuleGraph {
  environment: string;

  // URL/ID/file to module mappings
  urlToModuleMap: Map<string, EnvironmentModuleNode>;
  idToModuleMap: Map<string, EnvironmentModuleNode>;

  // Core methods
  getModuleByUrl(url: string): EnvironmentModuleNode | undefined;
  getModuleById(id: string): EnvironmentModuleNode | undefined;
  getModulesByFile(file: string): Set<EnvironmentModuleNode>;
  ensureEntryFromUrl(url: string): Promise<EnvironmentModuleNode>;
  invalidateModule(mod: EnvironmentModuleNode): void;
  invalidateAll(): void;
}
```

**Vite 5 vs Vite 6 Difference:**

```typescript
// Vite 5 - Mixed graph with ssr boolean
server.moduleGraph.getModuleByUrl(url, { ssr: true });

// Vite 6 - Environment-scoped graph
server.environments.ssr.moduleGraph.getModuleByUrl(url);
```

### 5. ModuleRunner

The `ModuleRunner` executes transformed code in target runtimes:

```typescript
class ModuleRunner {
  evaluatedModules: EvaluatedModules; // Cache of executed modules
  hmrClient?: HMRClient; // HMR support

  // Execute a module
  import(url: string): Promise<any>;

  // Clear caches
  clearCache(): void;
  close(): Promise<void>;
}
```

**Key Insight:** The server transforms code, but ModuleRunner executes it. This separation allows running code in browsers (via WebSocket), Node.js (direct), or custom runtimes like Cloudflare Workers.

### 6. HotChannel

Communication channel between server and runtime for HMR:

```typescript
interface HotChannel {
  send(payload: HotPayload): void; // Broadcast to all clients
  on(event: string, listener: Function): void;
  off(event: string, listener: Function): void;
}

// Usage in plugins
this.environment.hot.send({ type: 'full-reload' });
this.environment.hot.send({ type: 'custom', event: 'my-event', data: {} });
```

### 7. Transport

The `ModuleRunnerTransport` defines how server and runner communicate:

```typescript
interface ModuleRunnerTransport {
  connect?(handlers: { onMessage; onDisconnection }): void;
  send?(data: HotPayload): void;
  invoke?(data: HotPayload): Promise<{ result } | { error }>;
}
```

**Common Patterns:**

- **WebSocket** - Browser environments
- **Worker postMessage** - Worker thread environments
- **Direct calls** - Node.js in same process
- **HTTP fetch** - Isolated processes (no HMR)

## Plugin Hook Changes

### `this.environment` Context

Plugins now access the current environment via `this.environment`:

```typescript
const myPlugin = {
  name: 'my-plugin',

  transform(code, id) {
    // Access environment info
    const envName = this.environment.name;
    const isServer = this.environment.config.consumer === 'server';

    // Access module graph
    const mod = this.environment.moduleGraph.getModuleById(id);

    // Environment-specific transforms
    if (envName === 'client') {
      return clientTransform(code);
    }
    return serverTransform(code);
  },
};
```

### `hotUpdate` vs `handleHotUpdate`

**Old API (deprecated):**

```typescript
handleHotUpdate(ctx: HmrContext) {
  // ctx.server, ctx.modules, ctx.file, ctx.read
  // Called once for all environments
}
```

**New API:**

```typescript
hotUpdate(options: HotUpdateOptions) {
  // this.environment - current environment
  // options.modules - modules in THIS environment
  // options.file, options.read, options.type

  // Called once per environment that has affected modules
  if (this.environment.name === 'client') {
    this.environment.hot.send({ type: 'full-reload' })
    return []
  }
}
```

## Accessing Environments

### In Dev Server

```typescript
const server = await createServer(config);

// Access environments
const clientEnv = server.environments.client;
const ssrEnv = server.environments.ssr;

// Transform a URL
const result = await ssrEnv.transformRequest('/src/app.tsx');

// Access module graph
const mod = ssrEnv.moduleGraph.getModuleByUrl('/src/app.tsx');
```

### In Plugins

```typescript
configureServer(server) {
  // Access all environments
  for (const [name, env] of Object.entries(server.environments)) {
    console.log(`Environment: ${name}`)
  }
}

transform(code, id) {
  // Current environment
  const env = this.environment
}
```

## Creating Custom Environments

### Via Config

```typescript
export default {
  environments: {
    worker: {
      dev: {
        createEnvironment(name, config, context) {
          return new DevEnvironment(name, config, {
            hot: true,
            transport: customTransport,
          });
        },
      },
      build: {
        createEnvironment(name, config) {
          return new BuildEnvironment(name, config);
        },
      },
    },
  },
};
```

### Custom DevEnvironment Subclass

```typescript
class MyDevEnvironment extends DevEnvironment {
  private customState: Map<string, any>;

  constructor(name, config, context) {
    super(name, config, context);
    this.customState = new Map();
  }

  async close() {
    // Cleanup custom resources
    this.customState.clear();
    await super.close();
  }
}
```

## Migration from Vite 5

| Vite 5                   | Vite 6                                          |
| ------------------------ | ----------------------------------------------- |
| `server.moduleGraph`     | `environment.moduleGraph`                       |
| `options.ssr` boolean    | `this.environment.config.consumer === 'server'` |
| `handleHotUpdate()`      | `hotUpdate()`                                   |
| `server.ssrLoadModule()` | `environment.runner.import()`                   |
| Single module graph      | Per-environment module graphs                   |

## Key Takeaways for Qwik

1. **Separate Module Graphs** - Client and SSR have isolated dependency tracking. Qwik's QRL extraction may need to track which environment a QRL belongs to.

2. **Custom Environments** - Qwik could define a `qrl` or `optimizer` environment for QRL extraction if needed.

3. **Plugin Context** - Plugins can check `this.environment.name` to apply different transforms per environment.

4. **HMR Per Environment** - `hotUpdate` is called per environment, allowing environment-specific HMR logic.

5. **No More `ssr` Boolean** - All `ssr` checks should migrate to `this.environment.config.consumer === 'server'`.

## References

- [Vite Environment API Guide](https://vite.dev/guide/api-environment.html)
- [Environment Instances](https://vite.dev/guide/api-environment-instances.html)
- [Environment Plugins](https://vite.dev/guide/api-environment-plugins.html)
- [Environment Runtimes](https://vite.dev/guide/api-environment-runtimes.html)
- [vitejs/vite - server/environment.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/environment.ts)
- [vitejs/vite - server/moduleGraph.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/moduleGraph.ts)
