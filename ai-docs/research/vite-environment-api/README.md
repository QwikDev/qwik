# Vite Environment API Research

This directory contains research documentation for migrating Qwik's Vite plugins to the Vite 6+ Environment API.

## Documents

| Document                                                             | Description                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [01-vite-core-api.md](./01-vite-core-api.md)                         | Core Vite Environment API concepts, types, and migration patterns  |
| [02-nitro-implementation.md](./02-nitro-implementation.md)           | How Nitro implements FetchableDevEnvironment for SSR               |
| [03-cloudflare-workers.md](./03-cloudflare-workers.md)               | Cloudflare's custom DevEnvironment for workerd runtime             |
| [04-reference-implementations.md](./04-reference-implementations.md) | Patterns from hi-ogawa/vite-environment-examples                   |
| [05-vitepress-patterns.md](./05-vitepress-patterns.md)               | VitePress's HMR and module graph usage                             |
| [06-nuxt-implementation.md](./06-nuxt-implementation.md)             | Nuxt's feature flag approach and applyToEnvironment                |
| [07-astro-implementation.md](./07-astro-implementation.md)           | Astro's cross-environment module lookup for islands                |
| [08-qwik-requirements.md](./08-qwik-requirements.md)                 | Qwik-specific requirements and challenges                          |
| **[09-migration-strategy.md](./09-migration-strategy.md)**           | **Complete migration guide with exact code changes (start here!)** |

## Key Findings

### Common Patterns Across Frameworks

1. **Environment Guard in Hooks**

   ```typescript
   hotUpdate({ file }) {
     if (this.environment.name !== 'client') return;
     // Client-only logic
   }
   ```

2. **Per-Environment State**

   ```typescript
   const state = new WeakMap<Environment, State>();
   ```

3. **Cross-Environment Module Lookup**

   ```typescript
   const clientMod = server.environments.client.moduleGraph.getModuleById(id);
   const ssrMod = server.environments.ssr.moduleGraph.getModuleById(id);
   ```

4. **Feature Flag for Gradual Adoption**

   ```typescript
   experimental: {
     viteEnvironmentApi: true;
   }
   ```

5. **Custom DevEnvironment for Special Runtimes**

   ```typescript
   class CustomDevEnvironment extends DevEnvironment {
     async dispatchFetch(request: Request): Promise<Response> { ... }
   }
   ```

6. **applyToEnvironment for Plugin Scoping** (Nuxt)

   ```typescript
   {
     name: 'my-plugin',
     applyToEnvironment: (env) => env.name === 'client',
   }
   ```

7. **Custom HMR Events** (VitePress)

   ```typescript
   this.environment.hot.send({
     type: 'custom',
     event: 'my-event',
     data: payload,
   });
   ```

8. **Factory Pattern for Environments** (vite-environment-examples)
   ```typescript
   static createFactory(options) {
     return (name, config) => new CustomEnv(options, name, config);
   }
   ```

### Migration Priority

| Priority | Change                                                | Impact               |
| -------- | ----------------------------------------------------- | -------------------- |
| High     | `handleHotUpdate` → `hotUpdate`                       | HMR reliability      |
| High     | `server.moduleGraph` → `this.environment.moduleGraph` | Module tracking      |
| Medium   | `opts.target` → `this.environment.name`               | Code clarity         |
| Medium   | Add `environments` config                             | Future compatibility |
| Medium   | Add `applyToEnvironment` for scoped plugins           | Plugin organization  |
| Low      | Custom HMR events for granular updates                | Better DX            |
| Low      | Custom DevEnvironment classes                         | Advanced features    |
| Low      | Factory pattern for environments                      | Code organization    |

### Qwik-Specific Challenges

1. **QRL Segment Tracking** - Need per-environment tracking of extracted QRLs
2. **Manifest Cross-Environment** - Client manifest consumed by SSR build
3. **Optimizer Integration** - Rust optimizer is environment-agnostic
4. **Entry Strategy** - Different strategies per environment and mode

## Recommended Approach

1. **Phase 1:** Add feature flag, keep backward compatibility
2. **Phase 2:** Migrate transform hooks to use `this.environment`
3. **Phase 3:** Migrate module graph access
4. **Phase 4:** Migrate HMR from `handleHotUpdate` to `hotUpdate`
5. **Phase 5:** Implement coordinated builds with `builder.buildApp()`
6. **Phase 6:** Update qwik-router plugin
7. **Phase 7:** Documentation and deprecation notices

**Estimated Timeline:** 8 weeks for full migration

## Quick Reference

### Old vs New API

| Vite 5 (Legacy)          | Vite 6 (Environment API)                        |
| ------------------------ | ----------------------------------------------- |
| `server.moduleGraph`     | `this.environment.moduleGraph`                  |
| `options.ssr` boolean    | `this.environment.config.consumer === 'server'` |
| `handleHotUpdate(ctx)`   | `hotUpdate({ file, modules })`                  |
| `server.ssrLoadModule()` | `environment.runner.import()`                   |
| Single module graph      | Per-environment module graphs                   |

### Environment Configuration

```typescript
{
  environments: {
    client: {
      consumer: 'client',
      resolve: { conditions: ['browser'] },
      dev: { createEnvironment: ... },
    },
    ssr: {
      consumer: 'server',
      resolve: { conditions: ['node'] },
      dev: { createEnvironment: ... },
    },
  },
}
```

## References

- [Vite Environment API Guide](https://vite.dev/guide/api-environment.html)
- [Vite Environment Instances](https://vite.dev/guide/api-environment-instances.html)
- [Vite Environment Plugins](https://vite.dev/guide/api-environment-plugins.html)
- [hi-ogawa/vite-environment-examples](https://github.com/hi-ogawa/vite-environment-examples)
