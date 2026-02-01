# Astro's Vite Environment API Implementation

## Overview

Astro has adopted the Vite Environment API for handling HMR across client and SSR environments. Their implementation is particularly interesting because Astro has complex needs: `.astro` files compile to both client and server code, similar to Qwik's QRL extraction.

## Key Patterns

### 1. hotUpdate Hook with Environment Guard

Astro uses the new `hotUpdate` hook (not `handleHotUpdate`) with environment checks:

```typescript
// packages/astro/src/vite-plugin-hmr-reload/index.ts
export default function hmrReload(): Plugin {
  return {
    name: 'astro:hmr-reload',
    enforce: 'post',

    hotUpdate: {
      order: 'post', // Run after other plugins
      handler({ modules, server, timestamp }) {
        // Only process SSR environment
        if (this.environment.name !== 'ssr') return;

        let hasSsrOnlyModules = false;
        const invalidatedModules = new Set<EnvironmentModuleNode>();

        for (const mod of modules) {
          if (mod.id == null) continue;

          // Check if module exists in client environment
          const clientModule = server.environments.client.moduleGraph.getModuleById(mod.id);

          // If not in client, it's SSR-only
          if (clientModule != null) continue;

          // Invalidate SSR-only module
          this.environment.moduleGraph.invalidateModule(mod, invalidatedModules, timestamp, true);
          hasSsrOnlyModules = true;
        }

        // Trigger full reload for SSR-only changes
        if (hasSsrOnlyModules) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
  };
}
```

**Key Patterns:**

- `hotUpdate.order: 'post'` - Run after other HMR handlers
- `this.environment.name !== 'ssr'` - Environment guard
- `server.environments.client.moduleGraph` - Cross-environment module lookup
- `this.environment.moduleGraph.invalidateModule()` - Environment-scoped invalidation

### 2. Cross-Environment Module Lookup

Astro checks if a module exists in both environments:

```typescript
// Check if SSR module also exists in client
const clientModule = server.environments.client.moduleGraph.getModuleById(mod.id);

if (clientModule != null) {
  // Module exists in both - let normal HMR handle it
  continue;
}

// Module is SSR-only - handle specially
this.environment.moduleGraph.invalidateModule(mod, ...);
```

**Key Insight:** This pattern is directly applicable to Qwik's QRL handling - QRLs exist in client but are referenced from SSR.

### 3. Legacy handleHotUpdate Still Supported

Astro still uses `handleHotUpdate` for some plugins (backward compatibility):

```typescript
// packages/astro/src/vite-plugin-astro/index.ts
{
  name: 'astro:build',
  // ... other hooks

  async handleHotUpdate(ctx) {
    return handleHotUpdate(ctx, { logger, astroFileToCompileMetadata });
  },
}
```

**Note:** `handleHotUpdate` is deprecated but still works. New code should use `hotUpdate`.

### 4. Environment-Aware Transform

Astro checks environment in transform hook:

```typescript
// packages/astro/src/vite-plugin-astro/index.ts
{
  transform(code, id) {
    const parsedId = parseAstroRequest(id);

    // Handle style dependencies differently per environment
    if (this.environment.name === 'client') {
      const astroFilename = normalizePath(normalizeFilename(parsedId.filename, config.root));
      const compileMetadata = astroFileToCompileMetadata.get(astroFilename);

      if (compileMetadata && parsedId.query.type === 'style') {
        // Client-specific style handling
        const result = compileMetadata.css[parsedId.query.index];
        // ...
      }
    }
  },
}
```

### 5. Compile Metadata Tracking

Astro tracks compilation metadata per file for HMR:

```typescript
// packages/astro/src/vite-plugin-astro/hmr.ts
interface HandleHotUpdateOptions {
  logger: Logger;
  astroFileToCompileMetadata: Map<string, CompileMetadata>;
}

export async function handleHotUpdate(
  ctx: HmrContext,
  { logger, astroFileToCompileMetadata }: HandleHotUpdateOptions
) {
  // Invalidate compile metadata if CSS dependency updated
  // This ensures next transform re-generates metadata
  for (const [astroFile, metadata] of astroFileToCompileMetadata) {
    if (metadata.cssDeps.has(ctx.file)) {
      astroFileToCompileMetadata.delete(astroFile);
    }
  }
}
```

**Key Pattern:** Metadata cache invalidation on dependency changes - directly applicable to Qwik's QRL manifest.

## Architecture Comparison

### Astro's Compilation Model

```
.astro file
    │
    ├──► Server Component (SSR)
    │
    └──► Client Scripts (hydration islands)
```

### Qwik's Compilation Model

```
.tsx file with $() markers
    │
    ├──► Server Code (SSR)
    │
    └──► QRL Segments (lazy-loaded client code)
```

**Similarity:** Both frameworks extract client code from server-rendered components.

## HMR Strategy

Astro's HMR approach:

1. **Check environment** - Only process in relevant environment
2. **Cross-check modules** - See if module exists in other environment
3. **Selective invalidation** - Only invalidate what's needed
4. **Full reload fallback** - For SSR-only changes

```typescript
// Decision flow
if (this.environment.name !== 'ssr') return; // Skip non-SSR

for (const mod of modules) {
  const inClient = server.environments.client.moduleGraph.getModuleById(mod.id);

  if (inClient) {
    // In both envs - normal HMR
    continue;
  } else {
    // SSR-only - invalidate and reload
    this.environment.moduleGraph.invalidateModule(mod);
    needsReload = true;
  }
}

if (needsReload) {
  server.ws.send({ type: 'full-reload' });
}
```

## Relevance to Qwik

### Directly Applicable Patterns

1. **Cross-Environment Module Checking**

   ```typescript
   hotUpdate({ modules }) {
     if (this.environment.name !== 'client') return;

     for (const mod of modules) {
       // Check if QRL exists in SSR environment
       const ssrMod = server.environments.ssr.moduleGraph.getModuleById(mod.id);
       // Handle accordingly
     }
   }
   ```

2. **Metadata Cache Invalidation**

   ```typescript
   // Track QRL extraction results
   const qrlMetadata = new Map<string, QRLMetadata>();

   hotUpdate({ file }) {
     // Invalidate QRL metadata when source changes
     for (const [sourceFile, metadata] of qrlMetadata) {
       if (metadata.dependencies.has(file)) {
         qrlMetadata.delete(sourceFile);
       }
     }
   }
   ```

3. **Environment-Specific Transform**

   ```typescript
   transform(code, id) {
     if (this.environment.name === 'client') {
       // Client transform - emit QRLs
       return clientTransform(code, id);
     } else {
       // Server transform - reference QRLs
       return serverTransform(code, id);
     }
   }
   ```

4. **hotUpdate Hook Structure**

   ```typescript
   hotUpdate: {
     order: 'post',
     handler({ modules, server, timestamp }) {
       if (this.environment.name !== 'client') return;

       // Qwik-specific HMR logic
       const qrlModules = this.getAffectedQRLs(modules);
       // ...
     },
   }
   ```

### Key Differences

1. **Island Architecture vs Resumability**
   - Astro: Islands are explicit, separate entry points
   - Qwik: QRLs are implicit, extracted automatically

2. **Build Output**
   - Astro: Separate client bundles per island
   - Qwik: Unified manifest with QRL segments

3. **HMR Granularity**
   - Astro: Component-level HMR for islands
   - Qwik: Currently full reload, could improve

## Code References

- [withastro/astro - vite-plugin-hmr-reload/index.ts](https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-hmr-reload/index.ts)
- [withastro/astro - vite-plugin-astro/index.ts](https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-astro/index.ts)
- [withastro/astro - vite-plugin-astro/hmr.ts](https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-astro/hmr.ts)
- [withastro/astro - vite-plugin-scanner/index.ts](https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-scanner/index.ts)
