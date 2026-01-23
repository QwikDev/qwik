# Nuxt's Vite Environment API Implementation

## Overview

Nuxt has implemented experimental support for the Vite Environment API behind a feature flag (`experimental.viteEnvironmentApi`). This will become the default in Nuxt 5 (compatibilityVersion >= 5). Nuxt's approach provides a great example of gradual migration.

## Feature Flag Approach

```typescript
// packages/schema/src/config/experimental.ts
export default {
  experimental: {
    viteEnvironmentApi: {
      $resolve: async (val, get) => {
        // Default to true for Nuxt 5+
        return typeof val === 'boolean' ? val : (await get('future.compatibilityVersion')) >= 5;
      },
    },
  },
};
```

**Key Pattern:** Feature flag allows:

- Gradual rollout to users
- Maintaining backward compatibility
- Testing in production before becoming default

## Environment Configuration

### Client Environment

```typescript
// packages/vite/src/vite.ts
environments: {
  client: {
    consumer: 'client',          // Mark as client environment
    keepProcessEnv: false,       // Don't expose process.env to client
    dev: {
      warmup: [entry],           // Pre-transform entry point
    },
    ...clientEnvironment(nuxt, entry),
  },
}
```

### SSR Environment

```typescript
// packages/vite/src/server.ts
environments: {
  ssr: {
    resolve: {
      // Use Nitro's export conditions
      conditions: nitro.options.exportConditions,
    },
  },
}
```

### Combined Configuration

```typescript
// packages/vite/src/vite.ts
nuxt.options.experimental.viteEnvironmentApi
  ? {
      ...viteConfig,
      environments: {
        ssr: $server, // Server environment config
        client: $client, // Client environment config
      },
    }
  : viteConfig; // Fallback to legacy config
```

## Plugin Patterns

### applyToEnvironment Hook

Nuxt uses `applyToEnvironment` extensively to scope plugins:

```typescript
// Only apply to client environment
{
  name: 'nuxt:module-preload-polyfill',
  applyToEnvironment: environment => environment.name === 'client',
  configResolved(config) {
    // Client-only logic
  },
}

// Only apply to SSR in production
{
  name: 'nuxt:vue-feature-flags',
  applyToEnvironment: environment =>
    environment.name === 'ssr' && environment.config.isProduction,
  configResolved(config) {
    // SSR production-only logic
  },
}

// Conditional application with plugin transformation
{
  name: 'nuxt:resolve-externals',
  applyToEnvironment(environment) {
    if (nuxt.options.dev || environment.name !== 'ssr') {
      return false  // Don't apply
    }
    return {
      // Return transformed plugin for this environment
      name: 'nuxt:resolve-externals:external',
      // ... environment-specific hooks
    }
  },
}
```

### Environment-Aware Module Graph Access

```typescript
// packages/vite/src/plugins/vite-node.ts
function getManifest(nuxt: Nuxt, viteServer: ViteDevServer, clientEntry: string) {
  const css = new Set<string>();

  // Access SSR module graph based on feature flag
  const ssrServer = nuxt.options.experimental.viteEnvironmentApi
    ? viteServer.environments.ssr
    : viteServer;

  for (const key of ssrServer.moduleGraph.urlToModuleMap.keys()) {
    if (isCSS(key)) {
      const importers = ssrServer.moduleGraph.urlToModuleMap.get(key)?.importers;
      // ... process CSS
    }
  }
}
```

### Conditional Environment Access

```typescript
// packages/vite/src/plugins/vite-node.ts
// Access client environment based on feature flag
const client = nuxt.options.experimental.viteEnvironmentApi
  ? clientServer.environments.client
  : clientServer;

// Hook patterns differ based on flag
if (nuxt.options.experimental.viteEnvironmentApi) {
  // Single server with multiple environments
  await nuxt.callHook('vite:serverCreated', viteServer, {
    isClient: true,
    isServer: true,
  });
} else {
  // Separate servers for client/SSR (legacy)
  nuxt.hook('vite:serverCreated', (ssrServer, ctx) =>
    ctx.isServer ? resolveServer(ssrServer) : undefined
  );
}
```

## Build Configuration

```typescript
// packages/vite/src/vite.ts
...nuxt.options.experimental.viteEnvironmentApi
  ? {
      builder: {
        async buildApp(builder) {
          // Run builds serially to preserve order
          const environments = Object.values(builder.environments)
          for (const environment of environments) {
            await builder.build(environment)
          }
        },
      },
    }
  : {}
```

**Key Pattern:** Serial builds ensure client builds before SSR (for manifest generation).

## configEnvironment Hook

```typescript
// packages/vite/src/plugins/environments.ts
{
  name: 'nuxt:environments',

  configEnvironment(name, config) {
    // Legacy compatibility
    if (!nuxt.options.experimental.viteEnvironmentApi && viteConfig.ssr) {
      config.optimizeDeps ||= {}
      config.optimizeDeps.include = undefined
    }

    // Client-specific configuration
    if (name === 'client') {
      const outputConfig = config.build?.rollupOptions?.output
      // Configure client output
    }
  },
}
```

## Migration Patterns

### Conditional Logic

```typescript
// Before (Vite 5 style)
if (config.build.ssr) {
  // SSR logic
}

// After (Environment API style)
if (environment.name === 'ssr') {
  // SSR logic
}
```

### Server Access

```typescript
// Before
server.moduleGraph.getModuleById(id);

// After
server.environments.ssr.moduleGraph.getModuleById(id);
// or
server.environments.client.moduleGraph.getModuleById(id);
```

## Relevance to Qwik

### Patterns to Adopt

1. **Feature Flag for Migration**

   ```typescript
   // qwik.config.ts
   export default {
     experimental: {
       viteEnvironmentApi: true, // Opt-in during transition
     },
   };
   ```

2. **applyToEnvironment for Plugin Scoping**

   ```typescript
   {
     name: 'qwik:optimizer',
     applyToEnvironment: env => env.name === 'client',
     transform(code, id) {
       // Client-only QRL extraction
     },
   }
   ```

3. **Conditional Environment Access**

   ```typescript
   const moduleGraph = useEnvironmentApi
     ? server.environments[target].moduleGraph
     : server.moduleGraph;
   ```

4. **Serial Build Order**
   - Build client first (generate manifest)
   - Build SSR second (consume manifest)

### Key Differences

1. **Nitro Integration**
   - Nuxt uses Nitro for SSR runtime
   - Qwik has its own adapter system

2. **Vue-Specific Plugins**
   - Nuxt has Vue feature flags, etc.
   - Qwik needs optimizer-specific plugins

3. **Hook System**
   - Nuxt has `nuxt.callHook()` system
   - Qwik would need similar coordination

## Code References

- [nuxt/nuxt - packages/vite/src/vite.ts](https://github.com/nuxt/nuxt/blob/main/packages/vite/src/vite.ts)
- [nuxt/nuxt - packages/vite/src/plugins/environments.ts](https://github.com/nuxt/nuxt/blob/main/packages/vite/src/plugins/environments.ts)
- [nuxt/nuxt - packages/vite/src/plugins/vite-node.ts](https://github.com/nuxt/nuxt/blob/main/packages/vite/src/plugins/vite-node.ts)
- [nuxt/nuxt - packages/schema/src/config/experimental.ts](https://github.com/nuxt/nuxt/blob/main/packages/schema/src/config/experimental.ts)
