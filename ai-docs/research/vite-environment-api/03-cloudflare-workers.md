# Cloudflare Workers Vite Plugin - Environment API Implementation

## Overview

The `@cloudflare/vite-plugin` provides a sophisticated implementation of the Vite Environment API for running code in the Cloudflare Workers runtime (workerd). It's particularly relevant to Qwik because Qwik supports Cloudflare Pages/Workers deployments.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Vite Dev Server                             │
│  ┌──────────────┐     ┌────────────────────────────────────┐    │
│  │ client env   │     │ worker env (CloudflareDevEnv)      │    │
│  │ (browser)    │     │                                    │    │
│  └──────────────┘     │  ┌─────────────────────────────┐   │    │
│                       │  │ WebSocket HMR Channel       │   │    │
│                       │  └─────────────────────────────┘   │    │
│                       └──────────────────┬─────────────────┘    │
│                                          │ WebSocket              │
│                                          ▼                        │
│                       ┌────────────────────────────────────┐    │
│                       │          Miniflare (workerd)        │    │
│                       │  ┌─────────────────────────────┐   │    │
│                       │  │ Durable Object Coordinator  │   │    │
│                       │  │   - Module caching          │   │    │
│                       │  │   - Message relay           │   │    │
│                       │  │   - Promise deduplication   │   │    │
│                       │  └─────────────────────────────┘   │    │
│                       │  ┌─────────────────────────────┐   │    │
│                       │  │ CustomModuleRunner          │   │    │
│                       │  │   - Module evaluation       │   │    │
│                       │  │   - HMR handling            │   │    │
│                       │  └─────────────────────────────┘   │    │
│                       └────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. CloudflareDevEnvironment

Extends `DevEnvironment` for workerd-specific behavior:

```typescript
// packages/vite-plugin-cloudflare/src/cloudflare-environment.ts
class CloudflareDevEnvironment extends DevEnvironment {
  private webSocketContainer: WebSocketContainer;

  constructor(name: string, config: ResolvedConfig) {
    // Create WebSocket container for HMR
    const webSocketContainer = { webSocket: null };

    super(name, config, {
      hot: createHotChannel(webSocketContainer),
    });

    this.webSocketContainer = webSocketContainer;
  }

  // Override to establish WebSocket connection to miniflare
  async initRunner(): Promise<void> {
    // Dispatch fetch to INIT_PATH to get WebSocket
    const response = await miniflare.dispatchFetch(INIT_PATH);
    const webSocket = response.webSocket;
    webSocket.accept();
    this.webSocketContainer.webSocket = webSocket;
  }

  // Override to externalize workerd-specific modules
  async fetchModule(id: string, importer?: string): Promise<FetchResult> {
    // Handle CompiledWasm, Data, Text modules
    if (additionalModuleRE.test(id)) {
      return { externalize: id };
    }
    return super.fetchModule(id, importer);
  }
}
```

**Key Patterns:**

- WebSocket container passed to HotChannel for HMR
- `initRunner()` override establishes connection to workerd
- `fetchModule()` override handles workerd-specific module types

### 2. Environment Configuration

```typescript
// packages/vite-plugin-cloudflare/src/cloudflare-environment.ts
export function createCloudflareEnvironmentOptions(): EnvironmentOptions {
  return {
    resolve: {
      // Prioritize workerd package exports
      conditions: ['workerd', 'worker', 'browser'],
      // Register Cloudflare built-ins
      builtins: [...cloudflareBuiltInModules],
    },

    // Target workerd's V8 version
    build: {
      target: 'es2024',
      emitAssets: true,
    },

    // SSR optimization settings
    optimizeDeps: {
      ssr: {
        enabled: true,
        discovery: true,
      },
    },

    define: {
      // Handle process.env based on Node.js compat
      'process.env': nodeCompat ? 'process.env' : '{}',
    },

    dev: {
      createEnvironment(name, config) {
        return new CloudflareDevEnvironment(name, config);
      },
    },

    build: {
      createEnvironment(name, config) {
        return new vite.BuildEnvironment(name, config);
      },
    },
  };
}
```

### 3. Durable Object Module Coordinator

The module runner uses a Durable Object for state management:

```typescript
// packages/vite-plugin-cloudflare/src/workers/runner-worker/module-runner.ts
export class __VITE_RUNNER_OBJECT__ extends DurableObject {
  private webSocket: WebSocket | null = null;
  private modulePromises = new Map<string, Promise<any>>();

  // Called during init to establish WebSocket
  async fetch(request: Request): Promise<Response> {
    if (request.url.endsWith(INIT_PATH)) {
      const pair = new WebSocketPair();
      this.webSocket = pair[0];
      return new Response(null, {
        status: 101,
        webSocket: pair[1],
      });
    }
    // ... handle other requests
  }

  // Share module promises across Worker invocations
  async getFetchedModuleId(id: string, fetcher: () => Promise<any>) {
    if (!this.modulePromises.has(id)) {
      this.modulePromises.set(id, fetcher());
    }
    return this.modulePromises.get(id);
  }

  // Relay HMR messages to dev server
  send(data: any): void {
    this.webSocket?.send(JSON.stringify(data));
  }
}
```

**Key Pattern:** Durable Objects provide:

- Persistent WebSocket connection across Worker invocations
- Promise deduplication for concurrent module fetches
- Message relay for HMR

### 4. Custom Module Evaluator

Modules are evaluated using workerd's eval capability:

```typescript
// packages/vite-plugin-cloudflare/src/workers/runner-worker/module-runner.ts
class WorkerdModuleEvaluator implements ModuleEvaluator {
  async evaluate(context: ModuleRunnerContext, code: string, id: string) {
    // Use workerd's unsafe eval binding
    const fn = env.__VITE_UNSAFE_EVAL__.eval(code);

    // Execute with Vite's SSR context
    await fn(
      context.__vite_ssr_import__,
      context.__vite_ssr_dynamic_import__,
      context.__vite_ssr_exports__,
      context.__vite_ssr_exportAll__,
      context.__vite_ssr_import_meta__
    );

    // Seal exports to prevent modification
    Object.seal(context.__vite_ssr_exports__);
  }
}
```

### 5. HotChannel Implementation

WebSocket-based HMR channel:

```typescript
function createHotChannel(container: WebSocketContainer): HotChannel {
  return {
    send(payload: HotPayload): void {
      container.webSocket?.send(JSON.stringify(payload));
    },

    on(event: string, listener: Function): void {
      container.webSocket?.addEventListener('message', (evt) => {
        const data = JSON.parse(evt.data);
        if (data.type === event) {
          listener(data);
        }
      });
    },

    off(event: string, listener: Function): void {
      // Remove listener
    },
  };
}
```

## Multi-Worker Support

Cloudflare plugin supports multiple worker environments:

```typescript
// vite.config.ts
export default {
  environments: {
    // Entry worker
    worker: createCloudflareEnvironmentOptions(),

    // Service bindings (additional workers)
    'service-a': createCloudflareEnvironmentOptions(),
    'service-b': createCloudflareEnvironmentOptions(),
  },
};
```

Each worker gets its own:

- Environment name (transformed from worker name)
- Module graph
- Miniflare instance

## Relevance to Qwik

### Patterns to Adopt

1. **Custom DevEnvironment Subclass**

   ```typescript
   class QwikDevEnvironment extends DevEnvironment {
     // Add QRL-specific methods
     async extractQRLs(file: string): Promise<QRL[]> { ... }

     // Override for Qwik-specific module handling
     async fetchModule(id: string): Promise<FetchResult> { ... }
   }
   ```

2. **Environment-Specific Resolve Conditions**
   - Use `conditions: ["qwik", "worker", "browser"]` for QRL resolution
   - Different conditions for client vs server environments

3. **Build Target Configuration**
   - Configure build targets per environment
   - Edge environments need different targets than Node.js

4. **Module Externalization**
   - Override `fetchModule()` to handle Qwik-specific modules
   - Externalize QRLs differently per environment

### Differences to Note

1. **Runtime Complexity**
   - Cloudflare needs Durable Objects for state in stateless Workers
   - Qwik's Node.js/Bun environments don't need this complexity

2. **Module Evaluation**
   - Cloudflare uses `__VITE_UNSAFE_EVAL__` binding
   - Qwik can use standard Node.js evaluation

3. **WebSocket Architecture**
   - Cloudflare needs WebSocket through miniflare
   - Qwik can use direct communication in same-process SSR

## Code References

- [cloudflare/workers-sdk - cloudflare-environment.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vite-plugin-cloudflare/src/cloudflare-environment.ts)
- [cloudflare/workers-sdk - module-runner.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vite-plugin-cloudflare/src/workers/runner-worker/module-runner.ts)
- [cloudflare/workers-sdk - plugin-config.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vite-plugin-cloudflare/src/plugin-config.ts)
