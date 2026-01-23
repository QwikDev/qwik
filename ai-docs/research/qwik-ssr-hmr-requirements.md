# Qwik SSR HMR Requirements

Requirements and design considerations for implementing SSR HMR in Qwik, based on community feedback and Vite Environment API capabilities.

## Problem Statement

**Current behavior:** Any file change during development triggers a full page reload, causing ALL `routeLoader$`s to re-execute.

**User impact:**

- API quota consumed on every save, even for trivial changes
- Slow feedback loop during development
- Frustrating DX compared to other frameworks

**Desired behavior:** Change a button's text → only that component updates → unchanged `routeLoader$`s don't re-run → API costs saved.

---

## Context from GitHub Issue #303

### wmertens' Analysis (Sep 2025)

**Server-side HMR:** "pretty much solved" - module graph invalidation works correctly in Vite.

**Client-side HMR** (the hard part):

1. For modules already loaded on client → trigger re-renders of components that reference them
2. For code not on client → figure out which nodes to wake up, fallback is reload
3. Impacted components = those that transitively used any changed module

### wmertens' Proposed Solution: Signal-per-Bundle

```
1. Renderer keeps Record<bundle, Signal>
2. When a reactive QRL runs, subscribe it to Signal for its bundle
3. Inject component that listens for hot updates
4. On HMR, increment affected bundle signals → components re-render
5. If change is in non-reactive bundle → reload (fallback)
```

**Key insight:** "we could do the bundle subscribing when streaming the state and only subscribe reactive qrls we encounter at that point"

### Community Requests

From issue discussion:

- "I would be happy with just a reload when I change a component but not a full one with the route loader"
- "This is a must have for large apps with many route loaders"
- "Even partial HMR (just components, not data) would be huge"

---

## What Vite Environment API Provides

### Available Now

1. **Separate module graphs per environment**

   ```typescript
   server.environments.client.moduleGraph;
   server.environments.ssr.moduleGraph;
   ```

2. **Environment-specific HMR channels**

   ```typescript
   this.environment.hot.send({ type: 'full-reload' })
   this.environment.hot.send({ type: 'custom', event: 'qwik:hmr', data: {...} })
   ```

3. **SSR-only module detection**

   ```typescript
   const clientModule = server.environments.client.moduleGraph.getModuleById(mod.id);
   const isSsrOnly = clientModule === null;
   ```

4. **Per-environment module invalidation**
   ```typescript
   this.environment.moduleGraph.invalidateModule(mod, invalidatedModules, timestamp, true);
   ```

### What Environment API Does NOT Provide

1. **Component → module mapping** - No built-in way to know which components use which modules
2. **Partial re-rendering** - No mechanism to re-render only part of a page
3. **Data caching** - No automatic skipping of unchanged data loaders
4. **DOM patching** - No protocol for updating parts of the DOM

---

## Qwik-Specific Requirements

### 1. QRL Tracking System

**Requirement:** Track which QRLs are affected by module changes.

**Why:** QRLs are Qwik's lazy-loading boundaries. If we know which QRLs changed, we know which components need updates.

**Implementation needs:**

- Build-time: Record module → QRL mappings during transform
- Runtime: Track which QRLs are currently active on the page
- HMR: Map changed modules to affected QRLs

```typescript
// During transform, record:
const moduleQrlMap: Map<string, Set<string>> = new Map();
// moduleId → Set<qrlHash>

// During SSR, track:
const activeQrls: Set<string> = new Set();
// QRLs that were serialized to the page

// On HMR:
function getAffectedQrls(changedModules: string[]): string[] {
  const affected = new Set<string>();
  for (const moduleId of changedModules) {
    const qrls = moduleQrlMap.get(moduleId);
    if (qrls) {
      for (const qrl of qrls) {
        if (activeQrls.has(qrl)) {
          affected.add(qrl);
        }
      }
    }
  }
  return [...affected];
}
```

### 2. routeLoader$ Dependency Tracking

**Requirement:** Know which modules each `routeLoader$` depends on.

**Why:** To skip loaders whose dependencies haven't changed.

**Implementation needs:**

- Static analysis: Parse loader imports at build time
- Dynamic tracking: Record runtime module access during loader execution
- Cache: Store previous loader results keyed by dependency hash

```typescript
interface LoaderDependencies {
  loaderId: string; // e.g., "useGetProducts"
  routeId: string; // e.g., "/products/"
  staticImports: string[]; // Imports visible at build time
  dynamicImports: string[]; // Imports discovered at runtime
  lastResult: unknown; // Cached result
  dependencyHash: string; // Hash of all dependency contents
}

// On HMR:
function shouldRerunLoader(loader: LoaderDependencies, changedModules: string[]): boolean {
  const allDeps = [...loader.staticImports, ...loader.dynamicImports];
  return changedModules.some((m) => allDeps.includes(m));
}
```

### 3. Component → Module → QRL Relationship

**Requirement:** Map the full chain: Component → Modules it uses → QRLs it contains.

**Why:** To determine which component subtrees need re-rendering.

```typescript
interface ComponentModuleMap {
  componentId: string; // Unique component identifier
  moduleId: string; // Source module
  qrls: string[]; // QRLs defined in this component
  childComponents: string[]; // Child component IDs
  parentComponent: string; // Parent component ID
}

// Build a tree during SSR
const componentTree: Map<string, ComponentModuleMap> = new Map();
```

### 4. Partial SSR Re-render Protocol

**Requirement:** Re-render only affected components on server and send partial updates.

**Implementation needs:**

1. **Server-side:**

   ```typescript
   interface PartialRenderRequest {
     componentIds: string[]; // Which components to re-render
     previousState: SerializedState; // Qwik's serialized state
   }

   interface PartialRenderResponse {
     updates: Array<{
       componentId: string;
       html: string;
       newQrls: Record<string, string>; // QRL hash → chunk URL
       newState: Partial<SerializedState>;
     }>;
   }
   ```

2. **Client-side:**
   ```typescript
   // Listen for partial updates
   if (import.meta.hot) {
     import.meta.hot.on('qwik:partial-update', (data: PartialRenderResponse) => {
       for (const update of data.updates) {
         // Find DOM node
         const el = document.querySelector(`[q\\:id="${update.componentId}"]`);
         if (el) {
           // Replace HTML
           el.outerHTML = update.html;
           // Update QRL registry
           Object.assign(qrlRegistry, update.newQrls);
           // Merge state
           mergeQwikState(update.newState);
         }
       }
     });
   }
   ```

### 5. Signal-per-Bundle System (wmertens' Approach)

**Requirement:** Track bundle → signal mapping for reactive updates.

**Implementation:**

```typescript
// In core runtime (dev mode only)
const bundleSignals: Record<string, Signal<number>> = {};

function getBundleSignal(bundleId: string): Signal<number> {
  if (!bundleSignals[bundleId]) {
    bundleSignals[bundleId] = useSignal(0);
  }
  return bundleSignals[bundleId];
}

// When a QRL executes, subscribe to its bundle
function executeQrl(qrl: QRL) {
  const bundleId = getBundleId(qrl);
  const signal = getBundleSignal(bundleId);

  // Read signal to create subscription
  signal.value;

  // Execute actual QRL code
  return qrl();
}

// On HMR, increment affected bundle signals
import.meta.hot?.on('qwik:bundle-update', ({ bundles }: { bundles: string[] }) => {
  for (const bundleId of bundles) {
    const signal = bundleSignals[bundleId];
    if (signal) {
      signal.value++; // Triggers re-render of subscribed components
    }
  }
});
```

---

## How Do We Know What Changed?

This is the key question for Approach A (Smart Loader Skip).

### Vite Already Tracks This

Vite's module graph tracks dependencies:

```
file changed → Vite computes affected modules → hotUpdate receives list of affected modules
```

The `modules` array in `hotUpdate({ modules })` contains all modules transitively affected by the change.

### Mapping Modules to Loaders/server$

**Step 1: Build-time registration**

During Qwik's transform phase, we already identify routeLoader$ and server$. We could record:

```typescript
// During transform of /routes/products/index.tsx
{
  moduleId: '/src/routes/products/index.tsx',
  loaders: ['useGetProducts', 'useGetCategories'],
  serverFunctions: ['addToCart'],
}
```

**Step 2: On HMR, check affected modules**

```typescript
hotUpdate({ modules }) {
  const affectedModuleIds = modules.map(m => m.id);

  // Check which loaders are in affected modules
  for (const [moduleId, info] of loaderRegistry) {
    if (affectedModuleIds.includes(moduleId)) {
      // This loader was affected!
      staleLoaders.push(...info.loaders);
    }
  }
}
```

### The Transitive Dependency Problem

**Scenario:**

- `/routes/products/index.tsx` has `routeLoader$` that imports `fetchProducts` from `lib/api.ts`
- You change `lib/api.ts`

**Question:** Is the loader affected?

**Answer:** Yes, because `lib/api.ts` is in the loader's import tree.

**How Vite helps:** When `lib/api.ts` changes, Vite's module graph marks `/routes/products/index.tsx` as an importer. So the `modules` array in `hotUpdate` will include both files.

### What Approach A Actually Looks Like

```typescript
// Simplified flow

// 1. Build-time: Track which modules contain loaders
const moduleLoaderMap = new Map<string, string[]>();
// moduleId → ['loaderName1', 'loaderName2']

// 2. Runtime: Cache loader results
const loaderCache = new Map<string, { data: unknown, timestamp: number }>();

// 3. On HMR:
hotUpdate({ modules, server }) {
  const affectedModuleIds = new Set(modules.map(m => m.id));

  // Find which loaders are stale
  const staleLoaders: string[] = [];
  for (const [moduleId, loaders] of moduleLoaderMap) {
    if (affectedModuleIds.has(moduleId)) {
      staleLoaders.push(...loaders);
    }
  }

  // Send info to client
  server.hot.send({
    type: 'custom',
    event: 'qwik:hmr',
    data: { staleLoaders }
  });
}

// 4. On next page load (still full reload):
// - Stale loaders: re-execute (API call)
// - Unchanged loaders: return from cache (no API call)
```

### Would This Make Everyone Happy?

**What you get:**

- Change a component that doesn't affect loaders → **No API calls** (loaders return cached data)
- Change a loader or its dependencies → **Only that loader re-runs**
- Still full page reload, but much faster (cached data)

**What you DON'T get:**

- True partial update (component-only re-render without reload)
- Instant feedback (still need round-trip to server)

**Who it helps most:**

- Apps with expensive API calls in loaders
- Apps with many loaders where only one changes
- Anyone frustrated by unnecessary API costs

**Who might still want more:**

- People who want instant feedback (no reload at all)
- People who want component-level HMR like React Fast Refresh

### The server$ Case

server$ functions are similar but have different caching considerations:

- They're also QRLs in specific modules
- When their module changes, we know they changed
- But server$ are called on-demand (user actions), not on page load

**Decision:** Track both routeLoader$ and server$ for the caching mechanism.

**For server$ caching:**

- Cache based on: function ID + arguments hash
- Invalidate when module changes
- On HMR: mark server$ as stale, next call uses new code
- If client has old code calling new server$ → full reload as fallback

**For routeLoader$ caching:**

- Cache based on: loader ID + route params
- Invalidate when module changes
- On reload: stale loaders re-execute, unchanged loaders return cache

---

## Implementation Phases

### Phase 1: SSR-Only Module Detection (Foundation)

**Goal:** Distinguish SSR-only changes from shared changes.

**Changes:**

- Update `hotUpdate` hook to check client module graph
- SSR-only changes invalidate only SSR cache
- Still full-reload, but avoid unnecessary client rebuild

**Complexity:** Low
**Impact:** Faster HMR for server$ functions

### Phase 2: routeLoader$ Skip (Biggest User Impact)

**Goal:** Don't re-run unchanged loaders.

**Changes:**

- Track loader → module dependencies during transform
- Cache loader results during dev
- On HMR, determine which loaders are "stale"
- Re-render with mixed data (fresh stale loaders, cached unchanged)

**Complexity:** Medium
**Impact:** Significant API cost savings

### Phase 3: Component-Level Re-render (Advanced)

**Goal:** Re-render only affected components.

**Changes:**

- Track component → module mapping during SSR
- Implement partial render endpoint
- Client-side DOM patching
- State merging logic

**Complexity:** High
**Impact:** Best possible DX

### Phase 4: Signal-per-Bundle (Client-side Polish)

**Goal:** Reactive updates without full re-render.

**Changes:**

- Bundle signal system in core runtime
- QRL execution subscribes to bundle signal
- HMR increments signals to trigger re-renders

**Complexity:** High
**Impact:** Near-instant updates for reactive code

---

## Detection Mechanism: How It Would Actually Work

### Build-time: Transform Phase

During Qwik's existing transform (in `plugin.ts`), we already detect routeLoader$ and server$. We'd add:

```typescript
// In createPlugin() transform hook
interface QrlRegistryEntry {
  moduleId: string;
  type: 'routeLoader$' | 'server$' | 'component$';
  name: string;
  qrlHash: string;
}

// Populated during transform
const qrlRegistry: Map<string, QrlRegistryEntry[]> = new Map();

// During transform, when we see routeLoader$ or server$:
qrlRegistry.set(moduleId, [
  ...existing,
  { moduleId, type: 'routeLoader$', name: 'useGetProducts', qrlHash: 'abc123' },
]);
```

### Runtime: Dev Server

```typescript
// In vite.ts hotUpdate hook
hotUpdate: {
  order: 'post',
  handler({ modules, server }) {
    // Get all affected module IDs (Vite computed this for us)
    const affectedIds = new Set(modules.map(m => m.id).filter(Boolean));

    // Find which routeLoader$ and server$ are affected
    const staleQrls: QrlRegistryEntry[] = [];
    for (const [moduleId, entries] of qrlRegistry) {
      if (affectedIds.has(moduleId)) {
        staleQrls.push(...entries);
      }
    }

    // Categorize
    const staleLoaders = staleQrls.filter(q => q.type === 'routeLoader$');
    const staleServerFns = staleQrls.filter(q => q.type === 'server$');

    // What to do depends on what changed
    if (staleLoaders.length === 0 && staleServerFns.length === 0) {
      // Pure component change - could potentially do lighter update
      // For now, still full reload but loaders cached
    }

    // Send to client
    server.environments.client.hot.send({
      type: 'custom',
      event: 'qwik:hmr',
      data: {
        staleLoaders: staleLoaders.map(l => l.name),
        staleServerFns: staleServerFns.map(s => s.name),
        timestamp: Date.now()
      }
    });

    // Still full reload, but client knows what's stale
    server.environments.client.hot.send({ type: 'full-reload' });
    return [];
  }
}
```

### Runtime: SSR with Caching

```typescript
// In the dev SSR handler (simplified)
const loaderCache = new Map<string, { data: unknown; staleAfter: number }>();

async function executeLoader(loaderName: string, context: RequestContext) {
  const cacheKey = `${loaderName}:${context.url.pathname}:${JSON.stringify(context.params)}`;
  const cached = loaderCache.get(cacheKey);

  // Check if we have valid cache
  if (cached && cached.staleAfter > Date.now()) {
    console.log(`[HMR] Using cached data for ${loaderName}`);
    return cached.data;
  }

  // Execute loader
  console.log(`[HMR] Executing ${loaderName} (${cached ? 'stale' : 'no cache'})`);
  const data = await actualLoaderExecution(loaderName, context);

  // Cache it
  loaderCache.set(cacheKey, {
    data,
    staleAfter: Infinity, // Never stale until HMR marks it
  });

  return data;
}

// When HMR happens:
function onHmrStaleLoaders(staleLoaders: string[]) {
  for (const [key, entry] of loaderCache) {
    if (staleLoaders.some((name) => key.startsWith(`${name}:`))) {
      entry.staleAfter = 0; // Mark as stale
    }
  }
}
```

### The Flow

```
1. Developer edits lib/api.ts
2. Vite detects change, computes affected modules:
   - lib/api.ts (changed directly)
   - routes/products/index.tsx (imports lib/api.ts)
3. hotUpdate receives modules array with both files
4. We check qrlRegistry:
   - routes/products/index.tsx has routeLoader$ "useGetProducts"
   - Mark "useGetProducts" as stale
5. Send custom event to client with stale info
6. Full reload triggers
7. SSR runs:
   - useGetProducts: cache is stale → re-execute → API call
   - useGetCategories: cache valid → return cached → no API call
8. Page renders with fresh + cached data
```

---

## Technical Challenges

### 1. QRL Hash Stability

**Challenge:** QRL hashes change when code changes, breaking resumability.

**Consideration:** Need to update QRL registry on client when server code changes.

**Possible solution:** Send new QRL mappings with partial updates.

### 2. State Serialization Boundaries

**Challenge:** Qwik serializes state at component boundaries. Partial updates must respect these boundaries.

**Consideration:** Can't update half a component's state.

**Possible solution:** Always re-serialize entire component state, merge at component level.

### 3. Resumability vs HMR

**Challenge:** Resumability assumes server and client code match. HMR breaks this assumption.

**Consideration:** After HMR, some QRLs on client may not match server.

**Possible solution:**

- For reactive QRLs: Signal increment triggers re-download
- For non-reactive QRLs: Full reload (safe fallback)

### 4. server$ Function Calls

**Challenge:** `server$` functions may be called from client after HMR.

**Consideration:** Old client code calling new server code could cause issues.

**Possible solution:** Version the server$ endpoints, force reload on mismatch.

### 5. Build-time vs Runtime Tracking

**Challenge:** Some dependencies only known at runtime (dynamic imports, conditional requires).

**Consideration:** Static analysis misses dynamic patterns.

**Possible solution:**

- Static analysis for most cases
- Runtime instrumentation for edge cases
- Conservative fallback to full reload when uncertain

---

## Success Metrics

1. **API call reduction:** Measure routeLoader$ calls per file save
2. **Time to update:** From save to visible change
3. **Correctness:** No stale data displayed
4. **Fallback rate:** How often we fall back to full reload

---

## Open Questions

1. **Granularity:** Component-level or finer (e.g., individual QRL)?
2. **Cache invalidation:** How long to cache loader results? Memory limits?
3. **Error handling:** What if partial update fails mid-way?
4. **DevTools integration:** How to visualize which components updated?
5. **Testing:** How to test HMR behavior automatically?

---

## Existing Infrastructure: What Qwik Already Tracks

**Key Finding:** The Qwik optimizer already tracks exactly the information we need to identify `routeLoader$`, `server$`, and other server-only QRLs. We don't need to build a new tracking system.

### 1. `ctxName` in Segment Analysis

Every transformed QRL has a `ctxName` property that identifies its type:

```typescript
// From packages/qwik/src/optimizer/src/types.ts
export interface SegmentAnalysis {
  ctxKind: 'eventHandler' | 'function';
  ctxName: string; // ← This is the key! e.g., "routeLoader$", "server$", "component$"
  origin: string; // Source file path
  hash: string; // Unique QRL hash
  // ...
}
```

### 2. Server-Only vs Client-Only Classification

The optimizer already defines which QRLs are server-only and client-only:

```typescript
// From packages/qwik/src/optimizer/src/plugins/plugin.ts

// These are stripped FROM CLIENT (i.e., server-only)
const SERVER_STRIP_CTX_NAME = [
  'useServer',
  'route',
  'server', // server$
  'action$', // routeAction$
  'loader$', // routeLoader$
  'zod$',
  'validator$',
  'globalAction$',
];

// These are stripped FROM SERVER (i.e., client-only)
const CLIENT_STRIP_CTX_NAME = ['useClient', 'useBrowser', 'useVisibleTask', 'client', 'browser'];
```

### 3. Transform Output Cache

During dev, the optimizer caches transform results that include segment info:

```typescript
// plugin.ts line ~98
const clientResults = new Map<string, TransformOutput>();
const clientTransformedOutputs = new Map<string, [TransformModule, string]>();
const serverTransformedOutputs = new Map<string, [TransformModule, string]>();

// TransformOutput.modules[].segment.ctxName contains the QRL type
```

### 4. How to Leverage This for HMR

**During HMR, we can:**

1. Get the changed file's module ID from Vite's `hotUpdate` context
2. Look up the transformation output: `clientResults.get(moduleId)`
3. Extract all segments: `output.modules.map(m => m.segment).filter(Boolean)`
4. Check `ctxName` against `SERVER_STRIP_CTX_NAME` to identify server-only QRLs

**Example implementation:**

```typescript
// In hotUpdate hook
function getServerOnlyQrls(moduleId: string): SegmentAnalysis[] {
  const output = clientResults.get(moduleId);
  if (!output) return [];

  return output.modules
    .map((m) => m.segment)
    .filter(Boolean)
    .filter((seg) =>
      SERVER_STRIP_CTX_NAME.some((name) => seg.ctxName === name || seg.ctxName.includes(name))
    );
}

// Check if a module is server-only
function isServerOnlyModule(moduleId: string): boolean {
  const output = clientResults.get(moduleId);
  if (!output) return false;

  const segments = output.modules.map((m) => m.segment).filter(Boolean);
  if (segments.length === 0) return false;

  // All QRLs in this module are server-only
  return segments.every((seg) =>
    SERVER_STRIP_CTX_NAME.some((name) => seg.ctxName === name || seg.ctxName.includes(name))
  );
}
```

### 5. Manifest Already Contains This Info (Production)

The built manifest also tracks `ctxName`:

```json
{
  "symbols": {
    "s_abc123": {
      "ctxKind": "function",
      "ctxName": "routeLoader$",
      "origin": "src/routes/products/index.tsx",
      "hash": "abc123"
    }
  }
}
```

### 6. What This Means for Implementation

**We don't need to:**

- Build a new QRL tracking system
- Add transform-time annotations
- Modify the manifest structure

**We only need to:**

- Expose `clientResults` (or a helper function) to the HMR hook
- Add logic to check `ctxName` against the strip lists
- Implement the caching/staleness logic for loaders

**Complexity reduction:** The detection mechanism is already built. Implementation of Phase 2 (routeLoader$ skip) primarily involves:

1. Exposing existing transform data to HMR context
2. Building the loader result cache
3. Implementing staleness logic

---

## References

- GitHub Issue #303: https://github.com/QwikDev/qwik/issues/303
- wmertens' signal-per-bundle discussion: Issue #303 comments
- Vite Environment API: https://vite.dev/guide/api-environment
- Qwik Optimizer: `packages/qwik/src/optimizer/`
- Current HMR: `packages/qwik/src/optimizer/src/plugins/vite.ts`
