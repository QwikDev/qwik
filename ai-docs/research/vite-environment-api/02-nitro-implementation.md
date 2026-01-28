# Nitro's Vite Environment API Implementation

## Overview

Nitro (the server engine behind Nuxt) has a mature implementation of the Vite Environment API. It uses a custom `FetchableDevEnvironment` subclass that enables request handling through the environment during development.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vite Dev Server                       │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ client env      │  │ nitro env                   │  │
│  │ (browser)       │  │ (FetchableDevEnvironment)   │  │
│  └─────────────────┘  └─────────────────────────────┘  │
│                              │                          │
│                              ▼                          │
│                       ┌─────────────┐                   │
│                       │ NodeEnvRunner│                   │
│                       │ (child proc) │                   │
│                       └─────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### 1. FetchableDevEnvironment

Nitro extends `DevEnvironment` to add request dispatch capability:

```typescript
// src/build/vite/dev.ts
export class FetchableDevEnvironment extends DevEnvironment {
  devServer: DevServer;

  constructor(
    name: string,
    config: ResolvedConfig,
    context: DevEnvironmentContext,
    devServer: DevServer,
    entry: string
  ) {
    super(name, config, context);
    this.devServer = devServer;
    // Send initialization message to runner
    this.hot.send({
      type: 'custom',
      event: 'nitro:vite-env',
      data: { name, entry },
    });
  }

  // Key method: dispatch HTTP requests to the environment
  async dispatchFetch(request: Request): Promise<Response> {
    return this.devServer.fetch(request);
  }

  override async init(...args: any[]): Promise<void> {
    await this.devServer.init?.();
    return super.init(...args);
  }
}
```

**Key Pattern:** The `dispatchFetch` method allows HTTP requests to be processed by the environment's module runner, enabling SSR during development.

### 2. Environment Factory

The environment is created via the `createEnvironment` config option:

```typescript
// src/build/vite/env.ts
export function createNitroEnvironment(ctx: NitroPluginContext): EnvironmentOptions {
  return {
    consumer: 'server', // Mark as server environment
    build: {
      rollupOptions: ctx.bundlerConfig!.rollupConfig,
      minify: ctx.nitro!.options.minify,
      emptyOutDir: false,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(ctx.nitro!.options.dev ? 'development' : 'production'),
    },
    dev: {
      createEnvironment: (envName, envConfig) =>
        createFetchableDevEnvironment(
          envName,
          envConfig,
          getEnvRunner(ctx), // NodeEnvRunner instance
          resolve(runtimeDir, 'internal/vite/dev-entry.mjs')
        ),
    },
  };
}
```

**Key Patterns:**

- `consumer: "server"` - Tells Vite this is a server environment
- `dev.createEnvironment` - Factory function for custom DevEnvironment
- Entry point passed to runner for module execution

### 3. NodeEnvRunner

Nitro runs server code in a child process:

```typescript
// src/runner/node.ts
export class NodeEnvRunner implements EnvRunner {
  closed: boolean = false;
  #name: string;
  #entry: string;
  #data?: EnvRunnerData;

  constructor(options: NodeEnvRunnerOptions) {
    this.#name = options.name;
    this.#entry = options.entry;
    this.#data = options.data;
  }

  // Initialize the runner (spawn child process)
  async init(): Promise<void> { ... }

  // Send messages to child process
  sendMessage(data: any): void { ... }

  // Handle HTTP requests
  async fetch(request: Request): Promise<Response> { ... }

  // Cleanup
  close(): void { ... }
}
```

### 4. HotChannel Transport

Custom transport for HMR communication between server and runner:

```typescript
// src/build/vite/dev.ts
function createTransport(name: string, hooks: TransportHooks): HotChannel {
  const listeners = new WeakMap();
  return {
    send: (data) => hooks.sendMessage({ ...data, viteEnv: name }),
    on: (event, listener) => {
      const wrappedListener = (data: any) => {
        if (data.viteEnv === name) {
          listener(data);
        }
      };
      listeners.set(listener, wrappedListener);
      hooks.on('message', wrappedListener);
    },
    off: (event, listener) => {
      const wrappedListener = listeners.get(listener);
      if (wrappedListener) {
        hooks.off('message', wrappedListener);
      }
    },
  };
}
```

**Key Pattern:** Transport wraps messages with environment name (`viteEnv`) to route HMR messages to the correct environment.

### 5. Request Handling in Dev Server

```typescript
// src/build/vite/dev.ts
export async function configureViteDevServer(ctx: NitroPluginContext, server: ViteDevServer) {
  const nitroEnv = server.environments.nitro as FetchableDevEnvironment;

  // Handle file changes
  const reload = debounce(async () => {
    await scanHandlers(nitro);
    nitro.routing.sync();
    nitroEnv.moduleGraph.invalidateAll();
    nitroEnv.hot.send({ type: 'full-reload' });
  });

  // Middleware to handle requests
  server.middlewares.use(async (nodeReq, nodeRes, next) => {
    // ... static file handling ...

    // Dispatch request to nitro environment
    const envRes = await nitroEnv.dispatchFetch(req);
    await sendNodeResponse(nodeRes, envRes);
  });
}
```

**Key Patterns:**

- Access environment via `server.environments.nitro`
- Invalidate modules via `nitroEnv.moduleGraph.invalidateAll()`
- Trigger HMR via `nitroEnv.hot.send({ type: "full-reload" })`
- Dispatch HTTP requests via `nitroEnv.dispatchFetch(request)`

## Environment Configuration Summary

```typescript
{
  environments: {
    nitro: {
      consumer: "server",

      // Build configuration
      build: {
        rollupOptions: { ... },
        minify: true,
        emptyOutDir: false,
      },

      // Define replacements
      define: {
        "process.env.NODE_ENV": '"production"',
      },

      // Dev environment factory
      dev: {
        createEnvironment: (name, config) => {
          return new FetchableDevEnvironment(name, config, {
            hot: true,
            transport: customTransport,
          }, devServer, entryFile);
        },
      },
    },
  },
}
```

## Relevance to Qwik

### Patterns to Adopt

1. **Custom DevEnvironment Subclass**
   - Qwik could create `QwikDevEnvironment` for optimizer integration
   - Add methods like `extractQRLs()` or `getManifest()`

2. **Request Dispatch Pattern**
   - `dispatchFetch()` pattern useful for Qwik's SSR dev middleware
   - Could replace current `devSsrServer` implementation

3. **Module Graph Invalidation**
   - Use `environment.moduleGraph.invalidateAll()` for route changes
   - More granular than current full-reload approach

4. **HMR Channel Usage**
   - `environment.hot.send()` for Qwik-specific HMR events
   - Could enable better component HMR

### Differences to Note

1. **Child Process Runner**
   - Nitro runs server code in a child process
   - Qwik may not need this (can run in same process)

2. **Entry Point Architecture**
   - Nitro has a single server entry point
   - Qwik has multiple QRL entry points (may need different approach)

3. **Environment Naming**
   - Nitro uses `nitro` as environment name
   - Qwik might use `ssr` or `server` for compatibility

## Code References

- [nitrojs/nitro - src/build/vite/dev.ts](https://github.com/nitrojs/nitro/blob/main/src/build/vite/dev.ts) - FetchableDevEnvironment
- [nitrojs/nitro - src/build/vite/env.ts](https://github.com/nitrojs/nitro/blob/main/src/build/vite/env.ts) - Environment configuration
- [nitrojs/nitro - src/runner/node.ts](https://github.com/nitrojs/nitro/blob/main/src/runner/node.ts) - NodeEnvRunner
- [nitrojs/nitro - src/build/vite/plugin.ts](https://github.com/nitrojs/nitro/blob/main/src/build/vite/plugin.ts) - Plugin structure
