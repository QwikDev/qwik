# Reference Implementations - vite-environment-examples

## Overview

The [hi-ogawa/vite-environment-examples](https://github.com/hi-ogawa/vite-environment-examples) repository contains multiple reference implementations of the Vite Environment API. These examples are used in Vite's ecosystem CI and represent best practices.

## Key Examples

### 1. Child Process Environment

Runs code in a separate Node.js or Bun process with HTTP bridge communication.

```typescript
// examples/child-process/src/lib/vite/environment.ts
export class ChildProcessFetchDevEnvironment extends DevEnvironment {
  public bridge!: http.Server; // HTTP bridge server
  public bridgeUrl!: string; // Bridge URL for communication
  public child!: childProcess.ChildProcess;
  public childUrl!: string; // Child process URL

  constructor(
    private options: { command: string[] },
    name: string,
    config: ResolvedConfig
  ) {
    super(name, config, {
      hot: false, // No HMR in child process
      transport: createSseServerTransport(), // SSE for one-way updates
    });
  }

  // Factory for creating environments with different runtimes
  static createFactory(options: { runtime: 'node' | 'bun'; conditions?: string[] }) {
    return (name: string, config: ResolvedConfig) => {
      const command = [
        options.runtime === 'node' ? ['node', '--import', 'tsx/esm'] : [],
        options.runtime === 'bun' ? ['bun', 'run'] : [],
        options.conditions ? ['--conditions', ...options.conditions] : [],
        join(import.meta.dirname, `./runtime/${options.runtime}.js`),
      ].flat();

      return new ChildProcessFetchDevEnvironment({ command }, name, config);
    };
  }

  async init() {
    // 1. Generate security key
    const key = Math.random().toString(36).slice(2);

    // 2. Create HTTP bridge server
    this.bridge = http.createServer(
      webToNodeHandler(async (request) => {
        // Validate key and proxy requests
      })
    );
    await new Promise((resolve) => this.bridge.listen(0, resolve));
    this.bridgeUrl = `http://localhost:${this.bridge.address().port}`;

    // 3. Spawn child process
    this.child = childProcess.spawn(this.options.command[0], this.options.command.slice(1), {
      env: {
        ...process.env,
        __VITE_BRIDGE__: JSON.stringify({ url: this.bridgeUrl, key, root: this.config.root }),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
    });

    // 4. Wait for child to register
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Startup timeout')), 10000);
      this.child.stdio[3].on('data', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === 'register') {
          this.childUrl = `http://localhost:${event.port}`;
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await super.init();
  }

  // Dispatch HTTP requests to child process
  async dispatchFetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    url.host = new URL(this.childUrl).host;

    return fetch(
      new Request(url, {
        ...request,
        headers: {
          ...request.headers,
          'x-vite-meta': JSON.stringify({ entry: this.entry, url: request.url }),
        },
        redirect: 'manual',
      })
    );
  }

  async close() {
    this.child.kill();
    this.bridge.close();
    await super.close();
  }
}
```

**Key Patterns:**

- **Factory pattern** - `createFactory()` for different runtimes
- **Security key** - Validates bridge requests
- **Stdio pipe** - Child-to-parent communication for registration
- **HTTP bridge** - Proxies module requests to/from child

### 2. Workerd Environment

Runs code in Cloudflare's workerd runtime via Miniflare.

```typescript
// packages/workerd/src/plugin.ts
export function workerd(pluginOptions: WorkerdPluginOptions = {}): Plugin {
  return {
    name: 'workerd-environment',

    config() {
      return {
        environments: {
          [pluginOptions.name ?? 'workerd']: {
            resolve: {
              conditions: ['workerd', 'worker'],
              noExternal: true,
            },

            dev: {
              createEnvironment: (name, config) =>
                createWorkerdDevEnvironment(name, config, pluginOptions),
            },

            build: pluginOptions.entry
              ? {
                  ssr: true,
                  rollupOptions: {
                    input: { index: pluginOptions.entry },
                  },
                }
              : {},
          },
        },
      };
    },
  };
}

async function createWorkerdDevEnvironment(
  name: string,
  config: ResolvedConfig,
  options: WorkerdPluginOptions
): Promise<DevEnvironment> {
  // Read worker code from disk
  const workerContent = await fs.readFile(join(import.meta.dirname, './worker.js'), 'utf-8');

  // Configure Miniflare
  const miniflare = new Miniflare({
    modules: [{ type: 'ESModule', path: '__vite_worker__', contents: workerContent }],
    durableObjects: {
      __viteRunner: 'RunnerObject',
    },
    serviceBindings: {
      __viteInvoke: async (request) => {
        // Handle invoke payloads from worker
        const payload = await request.json();
        const result = await environment.hot.invoke(payload);
        return new Response(JSON.stringify(result));
      },
    },
    ...options.miniflare,
  });

  // Get runner object for communication
  const runnerObject = await miniflare.getDurableObjectNamespace('__viteRunner');

  // Create custom HotChannel
  const transport: HotChannel = {
    send: runnerObject.__viteServerSend,
    on: (event, listener) => listeners.set(event, listener),
    off: (event) => listeners.delete(event),
  };

  // Custom DevEnvironment that cleans up miniflare
  class WorkerdDevEnvironmentImpl extends DevEnvironment {
    override async close() {
      await super.close();
      await miniflare.dispose();
    }
  }

  return new WorkerdDevEnvironmentImpl(name, config, {
    hot: true,
    transport,
  });
}
```

**Key Patterns:**

- **Miniflare integration** - Local workerd simulation
- **Durable Object** - State management for module runner
- **Service bindings** - RPC-style communication
- **Cleanup override** - Dispose miniflare on close

### 3. React Server Components Environment

Configures separate environments for server and client components.

```typescript
// examples/react-server/vite.config.ts (simplified)
export default defineConfig({
  environments: {
    // Client environment (browser)
    client: {
      build: {
        outDir: 'dist/client',
        rollupOptions: {
          input: './src/entry-client.tsx',
        },
      },
    },

    // RSC environment (server components)
    rsc: {
      resolve: {
        conditions: ['react-server'],
        externalConditions: ['react-server'],
      },
      dev: {
        createEnvironment: ChildProcessFetchDevEnvironment.createFactory({
          runtime: 'bun',
          conditions: ['react-server'],
        }),
      },
      build: {
        outDir: 'dist/rsc',
        rollupOptions: {
          input: './src/entry-rsc.tsx',
        },
      },
    },

    // SSR environment (server rendering)
    ssr: {
      build: {
        outDir: 'dist/ssr',
        rollupOptions: {
          input: './src/entry-ssr.tsx',
        },
      },
    },
  },
});
```

**Key Pattern:** Three environments with different resolve conditions:

- `client` - Standard browser conditions
- `rsc` - `react-server` condition for server components
- `ssr` - Standard SSR conditions

## Common Patterns Across Examples

### 1. Factory Functions for Environment Creation

```typescript
static createFactory(options: Options) {
  return (name: string, config: ResolvedConfig) => {
    return new CustomDevEnvironment(options, name, config);
  };
}

// Usage in config
dev: {
  createEnvironment: CustomDevEnvironment.createFactory({ ... }),
}
```

### 2. Custom Cleanup in close()

```typescript
class CustomDevEnvironment extends DevEnvironment {
  override async close() {
    // Clean up custom resources
    await this.customResource.dispose();
    // Always call super
    await super.close();
  }
}
```

### 3. dispatchFetch Pattern

```typescript
async dispatchFetch(request: Request): Promise<Response> {
  // Add environment-specific headers
  const headers = new Headers(request.headers);
  headers.set("x-vite-env", this.name);

  // Proxy to runtime
  return this.runtime.fetch(new Request(request, { headers }));
}
```

### 4. Transport Abstraction

```typescript
interface EnvironmentTransport {
  // Send to runtime
  send(data: any): void;

  // Invoke with response
  invoke(data: any): Promise<any>;

  // Listen for messages
  on(event: string, listener: Function): void;
}
```

## Relevance to Qwik

### Patterns to Adopt

1. **Factory Pattern for Environments**

   ```typescript
   class QwikDevEnvironment extends DevEnvironment {
     static createFactory(options: QwikOptions) {
       return (name, config) => new QwikDevEnvironment(options, name, config);
     }
   }
   ```

2. **Multiple Environment Configuration**
   - `client` - Browser with Qwik optimizer
   - `ssr` - Server-side rendering
   - Potentially `worker` for web workers

3. **Custom dispatchFetch for SSR**
   - Replace current `devSsrServer` implementation
   - More integrated with Vite's module system

4. **Resolve Conditions**
   ```typescript
   environments: {
     client: {
       resolve: { conditions: ["browser", "import"] },
     },
     ssr: {
       resolve: { conditions: ["node", "import"] },
     },
   }
   ```

### Differences to Note

1. **QRL Extraction**
   - Qwik's optimizer extracts QRLs during transform
   - May need environment-aware extraction

2. **Manifest Generation**
   - Qwik generates manifest in client build
   - Consumed in SSR build
   - Environment API may change this flow

3. **Entry Points**
   - Examples have clear entry points
   - Qwik has dynamic QRL entries

## Code References

- [child-process/environment.ts](https://github.com/hi-ogawa/vite-environment-examples/blob/main/examples/child-process/src/lib/vite/environment.ts)
- [workerd/plugin.ts](https://github.com/hi-ogawa/vite-environment-examples/blob/main/packages/workerd/src/plugin.ts)
- [react-server/vite.config.ts](https://github.com/hi-ogawa/vite-environment-examples/blob/main/examples/react-server/vite.config.ts)
- [Vite ecosystem CI tests](https://github.com/vitejs/vite-ecosystem-ci/blob/main/tests/vite-environment-examples.ts)
