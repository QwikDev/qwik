# VitePress - Environment API Patterns

## Overview

VitePress is a static site generator built on Vite. It provides excellent examples of using the Environment API for HMR and module graph manipulation. These patterns are directly applicable to Qwik's plugin implementation.

## Key Patterns

### 1. Environment Guard in hotUpdate

VitePress consistently checks the environment name before processing:

```typescript
// src/node/plugin.ts
async hotUpdate({ file, type }) {
  // Only process for client environment
  if (this.environment.name !== 'client') return

  const relativePath = path.posix.relative(srcDir, file)

  // Process markdown file changes
  if (file.endsWith('.md') && type !== 'update') {
    // Handle create/delete
  }
}
```

**Key Pattern:** `if (this.environment.name !== 'client') return` ensures hooks only run for the intended environment.

### 2. Module Graph Lookup

VitePress uses `this.environment.moduleGraph` to find and manipulate modules:

```typescript
// src/node/plugin.ts
async hotUpdate({ file, modules: existingMods }) {
  if (this.environment.name !== 'client') return

  const modules: EnvironmentModuleNode[] = []

  // Get module by file path
  if (file.endsWith('.md')) {
    const mod = this.environment.moduleGraph.getModuleById(file)
    mod && modules.push(mod)
  }

  // Get modules by importer relationship
  importerMap[slash(file)]?.forEach((relativePath) => {
    clearCache(relativePath)
    const mod = this.environment.moduleGraph.getModuleById(
      path.posix.join(srcDir, relativePath)
    )
    mod && modules.push(mod)
  })

  // Return combined modules for HMR
  return [...existingMods, ...modules]
}
```

**Key Methods:**

- `getModuleById(id)` - Get module by its resolved ID
- `getModuleByUrl(url)` - Get module by its URL
- `getModulesByFile(file)` - Get all modules for a file

### 3. Full Reload via HMR Channel

When a significant change requires full reload:

```typescript
// src/node/plugin.ts
async hotUpdate({ file, type }) {
  if (this.environment.name !== 'client') return

  // Config change - invalidate everything
  if (file === configPath || configDeps.includes(file)) {
    siteConfig.logger.info(c.green('page reload ') + c.dim(relativePath), {
      clear: true,
      timestamp: true
    })

    // Invalidate all modules in the graph
    this.environment.moduleGraph.invalidateAll()

    // Send full-reload to client
    this.environment.hot.send({ type: 'full-reload' })

    // Return empty to prevent default HMR
    return []
  }
}
```

**Key Pattern:**

1. `moduleGraph.invalidateAll()` - Clear all cached transforms
2. `hot.send({ type: 'full-reload' })` - Tell client to reload
3. `return []` - Prevent Vite's default HMR handling

### 4. Custom HMR Events

VitePress sends custom events for partial updates:

```typescript
// src/node/plugin.ts
async hotUpdate({ file }) {
  if (this.environment.name !== 'client') return

  // Check if pageData changed
  const newData = await getPageData(file)
  if (newData !== oldData) {
    const payload: PageDataPayload = {
      path: `/${relativePath}`,
      pageData: newData
    }

    // Send custom event to client
    this.environment.hot.send({
      type: 'custom',
      event: 'vitepress:pageData',
      data: payload
    })
  }
}

// Client-side handler (in browser)
if (import.meta.hot) {
  import.meta.hot.on('vitepress:pageData', (payload) => {
    // Update page data without full reload
    updatePageData(payload)
  })
}
```

**Key Pattern:** Custom events enable fine-grained updates without full HMR cycles.

### 5. Dependency Tracking in Plugins

VitePress tracks dependencies for proper invalidation:

```typescript
// src/node/plugins/staticDataPlugin.ts
const depToLoaderModuleIdsMap: Record<string, Set<string>> = {}
const idToLoaderModulesMap: Record<string, LoaderModule> = {}

// During transform, track dependencies
transform(code, id) {
  // Record dependency -> loader relationship
  for (const dep of discoveredDeps) {
    depToLoaderModuleIdsMap[dep] ??= new Set()
    depToLoaderModuleIdsMap[dep].add(id)
  }
}

// During hotUpdate, find affected loaders
hotUpdate({ file, modules: existingMods }) {
  if (this.environment.name !== 'client') return

  const modules: EnvironmentModuleNode[] = []
  const normalizedFile = normalizePath(file)

  // Check if file is a dependency of any loader
  if (normalizedFile in depToLoaderModuleIdsMap) {
    for (const id of depToLoaderModuleIdsMap[normalizedFile]) {
      // Invalidate loader state
      delete idToLoaderModulesMap[id]

      // Add loader module to HMR update
      const mod = this.environment.moduleGraph.getModuleById(id)
      if (mod) modules.push(mod)
    }
  }

  return [...existingMods, ...modules]
}
```

**Key Pattern:** Maintain maps between dependencies and their consumers for proper cascade invalidation.

### 6. Dynamic Routes Plugin

VitePress handles dynamic routes with environment-aware HMR:

```typescript
// src/node/plugins/dynamicRoutesPlugin.ts
import type { EnvironmentModuleGraph, EnvironmentModuleNode } from 'vite'

// Helper to get modules and their dependencies
function getModules(
  id: string,
  envModuleGraph: EnvironmentModuleGraph,
  deleteFromCache = true
): EnvironmentModuleNode[] {
  const modules: EnvironmentModuleNode[] = []

  // Get the module itself
  const mod = envModuleGraph.getModuleById(id)
  if (mod) {
    modules.push(mod)

    // Also get importers (modules that import this one)
    for (const importer of mod.importers) {
      modules.push(importer)
    }
  }

  if (deleteFromCache) {
    routeModuleCache.delete(id)
  }

  return modules
}

// In hotUpdate
async hotUpdate({ file, modules: existingMods }) {
  if (this.environment.name !== 'client') return

  const modules: EnvironmentModuleNode[] = []
  const normalizedFile = normalizePath(file)

  // Get affected modules including importers
  modules.push(...getModules(normalizedFile, this.environment.moduleGraph))

  // Check watch patterns for additional invalidation
  for (const [file, route] of routeModuleCache) {
    if (route.watch?.length && pm(route.watch)(normalizedFile)) {
      route.routes = undefined  // Clear cached routes
      modules.push(...getModules(file, this.environment.moduleGraph, false))
    }
  }

  return [...existingMods, ...modules]
}
```

**Key Pattern:** Use `mod.importers` to cascade HMR to dependent modules.

## API Summary

### this.environment Properties

| Property      | Type                     | Description                              |
| ------------- | ------------------------ | ---------------------------------------- |
| `name`        | `string`                 | Environment name ('client', 'ssr', etc.) |
| `moduleGraph` | `EnvironmentModuleGraph` | Module dependency graph                  |
| `hot`         | `HotChannel`             | HMR communication channel                |
| `config`      | `ResolvedConfig`         | Environment-specific config              |

### EnvironmentModuleGraph Methods

| Method                   | Description                     |
| ------------------------ | ------------------------------- |
| `getModuleById(id)`      | Get module by resolved ID       |
| `getModuleByUrl(url)`    | Get module by URL               |
| `getModulesByFile(file)` | Get all modules for a file path |
| `invalidateModule(mod)`  | Invalidate a specific module    |
| `invalidateAll()`        | Invalidate all modules          |

### HotChannel Methods

| Method                 | Description                   |
| ---------------------- | ----------------------------- |
| `send(payload)`        | Send HMR payload to client    |
| `on(event, listener)`  | Listen for events from client |
| `off(event, listener)` | Remove event listener         |

### hotUpdate Hook Signature

```typescript
async hotUpdate(options: {
  file: string              // Absolute file path
  type: 'create' | 'update' | 'delete'
  timestamp: number
  modules: EnvironmentModuleNode[]  // Pre-found modules
  read: () => Promise<string>       // Read file content
}): Promise<EnvironmentModuleNode[] | void>
```

## Relevance to Qwik

### Direct Applications

1. **Environment Guard Pattern**

   ```typescript
   hotUpdate({ file }) {
     if (this.environment.name !== 'client') return
     // Client-only HMR logic
   }
   ```

2. **QRL Invalidation**

   ```typescript
   hotUpdate({ file }) {
     // When a file with QRLs changes
     const qrlModules = this.getAffectedQRLModules(file)
     for (const mod of qrlModules) {
       this.environment.moduleGraph.invalidateModule(mod)
     }
   }
   ```

3. **Manifest Updates**

   ```typescript
   hotUpdate({ file }) {
     if (this.isQRLFile(file)) {
       // Update manifest
       this.updateManifest(file)

       // Send custom event to client
       this.environment.hot.send({
         type: 'custom',
         event: 'qwik:manifest-update',
         data: { file }
       })
     }
   }
   ```

4. **Route Changes**

   ```typescript
   hotUpdate({ file, type }) {
     if (this.environment.name !== 'client') return

     // Route file created/deleted
     if (this.isRouteFile(file) && type !== 'update') {
       this.environment.moduleGraph.invalidateAll()
       this.environment.hot.send({ type: 'full-reload' })
       return []
     }
   }
   ```

### Migration from handleHotUpdate

```typescript
// Old (Vite 5)
handleHotUpdate(ctx) {
  const { server, file, modules } = ctx
  // Single callback for all environments
}

// New (Vite 6)
hotUpdate({ file, modules }) {
  // Called per environment
  const env = this.environment
  // Environment-specific logic
}
```

## Code References

- [vuejs/vitepress - src/node/plugin.ts](https://github.com/vuejs/vitepress/blob/main/src/node/plugin.ts)
- [vuejs/vitepress - src/node/plugins/staticDataPlugin.ts](https://github.com/vuejs/vitepress/blob/main/src/node/plugins/staticDataPlugin.ts)
- [vuejs/vitepress - src/node/plugins/dynamicRoutesPlugin.ts](https://github.com/vuejs/vitepress/blob/main/src/node/plugins/dynamicRoutesPlugin.ts)
- [vuejs/vitepress - src/node/plugins/localSearchPlugin.ts](https://github.com/vuejs/vitepress/blob/main/src/node/plugins/localSearchPlugin.ts)
