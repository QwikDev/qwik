# Key Areas of Concern: Vite Environment API Migration

This document identifies critical areas in the Qwik codebase that require careful attention during the Vite 7+ Environment API migration. Items are prioritized by risk level.

---

## Priority 1: Critical (Breaking if not handled)

### 1.1 HMR Module Graph Access in `handleHotUpdate`

**File:** `packages/qwik/src/optimizer/src/plugins/plugin.ts` (lines 1032-1054)

**Current Pattern:**

```typescript
function handleHotUpdate(ctx: HmrContext) {
  const mod = ctx.server.moduleGraph.getModuleById(key);
  if (mod) {
    ctx.server.moduleGraph.invalidateModule(mod);
  }
}
```

**Problem:** Uses legacy `ctx.server.moduleGraph` directly without environment awareness. In Vite 7+, each environment has its own module graph.

**Risk:** QRL segments may not be properly invalidated, causing stale code during development.

**Solution Pattern:**

```typescript
// From qwik-router plugin.ts - already environment-aware
if (server.environments) {
  for (const env of Object.values(server.environments)) {
    const mod = env.moduleGraph.getModuleById(key);
    if (mod) env.moduleGraph.invalidateModule(mod);
  }
} else {
  const mod = server.moduleGraph.getModuleById(key);
  if (mod) server.moduleGraph.invalidateModule(mod);
}
```

---

### 1.2 HMR Hot Channel Access

**File:** `packages/qwik/src/optimizer/src/plugins/vite.ts` (lines 633-643)

**Current Pattern:**

```typescript
handleHotUpdate(ctx) {
  if (ctx.modules.length) {
    ctx.server.hot.send({ type: 'full-reload' });
  }
}
```

**Problem:** Uses `ctx.server.hot` instead of environment-specific hot channel.

**Risk:** HMR messages may not reach the correct environment's clients.

**Solution:** In Vite 7+, use `this.environment.hot.send()` within `hotUpdate` hook.

---

### 1.3 Dev Server Module Graph in Plugin Hooks

**File:** `packages/qwik/src/optimizer/src/plugins/plugin.ts`

| Line | Hook          | Current Pattern                          | Issue                 |
| ---- | ------------- | ---------------------------------------- | --------------------- |
| 492  | `resolveId()` | `devServer!.moduleGraph.getModuleById()` | Not environment-aware |
| 708  | `load()`      | `devServer.moduleGraph.getModuleById()`  | Not environment-aware |
| 793  | `transform()` | `devServer.moduleGraph.getModuleById()`  | Not environment-aware |

**Problem:** All three hooks access `devServer.moduleGraph` directly.

**Risk:** Module resolution may return wrong results when client and SSR have different module states.

---

## Priority 2: High (Affects correctness)

### 2.1 Manifest Cross-Build Timing

**Files:**

- `packages/qwik/src/optimizer/src/plugins/plugin.ts` (lines 981-1007)
- `packages/qwik/src/optimizer/src/plugins/vite.ts` (lines 495-555)

**Current Flow:**

1. Client build generates manifest in `generateBundle` hook
2. SSR build reads manifest from disk via `manifestInputPath`
3. No coordination mechanism between builds

**Problem:** With Vite 7+ `builder.buildApp()`, builds may run in different order or parallel. File-based manifest handoff has no locking.

**Risk:** SSR build may read incomplete/missing manifest.

**Recommendation:** Use `builder.buildApp()` to explicitly order client → SSR builds:

```typescript
builder: {
  async buildApp(builder) {
    await builder.build(builder.environments.client);
    await builder.build(builder.environments.ssr);
  },
}
```

---

### 2.2 Transform Output Cache Separation

**File:** `packages/qwik/src/optimizer/src/plugins/plugin.ts` (lines 98-101)

**Current Pattern:**

```typescript
const clientResults = new Map<string, TransformOutput>();
const clientTransformedOutputs = new Map<string, [TransformModule, string]>();
const serverTransformedOutputs = new Map<string, [TransformModule, string]>();
```

**Status:** Already separated by target, but shared within plugin instance.

**Concern:** In Vite 7+ with true environment isolation, these maps may need to be scoped per-environment using `WeakMap<Environment, Map>` pattern (like VitePress).

---

### 2.3 Code Stripping Depends on Accurate `isServer` Detection

**File:** `packages/qwik/src/optimizer/src/plugins/plugin.ts` (lines 812-820)

**Current Pattern:**

```typescript
if (isServer) {
  transformOpts.stripCtxName = CLIENT_STRIP_CTX_NAME;
  transformOpts.stripEventHandlers = true;
} else {
  transformOpts.stripCtxName = SERVER_STRIP_CTX_NAME;
  transformOpts.stripExports = SERVER_STRIP_EXPORTS;
}
```

**Dependency:** Relies on `getIsServer()` returning correct value.

**Risk:** If environment detection fails, wrong code gets stripped → runtime errors.

**Current Detection Chain:**

1. `environment?.config?.consumer === 'server'` ✅ (Vite 7+)
2. `environment?.name === 'ssr'` ✅ (fallback)
3. `devServer ? viteOpts?.ssr : opts.target` ✅ (Rolldown fallback)

**Status:** Detection looks solid, but needs testing across all scenarios.

---

## Priority 3: Medium (Affects DX/performance)

### 3.1 Always Full-Reload HMR

**File:** `packages/qwik/src/optimizer/src/plugins/vite.ts` (line 636)

**Current Behavior:**

```typescript
// Tell the client to reload the page if any modules were used in ssr or client
// this needs to be refined
if (ctx.modules.length) {
  ctx.server.hot.send({ type: 'full-reload' });
}
```

**Problem:** Every file change triggers full page reload. Comment acknowledges this "needs to be refined."

**Opportunity:** With Environment API, could implement granular HMR:

- Style-only changes → CSS HMR
- QRL-only changes → Partial component refresh
- Server code changes → SSR re-render only

---

### 3.2 Bundle Graph Adders Shared Across Environments

**File:** `packages/qwik/src/optimizer/src/plugins/vite.ts` (lines 92, 549)

**Current Pattern:**

```typescript
const bundleGraphAdders = new Set<BundleGraphAdder>();

api: {
  registerBundleGraphAdder: (adder) => bundleGraphAdders.add(adder),
}
```

**Concern:** Single Set accumulates adders from both environments. If adders have environment-specific logic, results may be incorrect.

**Recommendation:** Consider per-environment adder sets or ensure adders are idempotent.

---

### 3.3 CSS URL Extraction Uses SSR Module Graph

**File:** `packages/qwik-router/src/buildtime/vite/dev-middleware.ts` (line 102)

**Current Pattern:**

```typescript
const moduleGraph = server.environments?.ssr?.moduleGraph ?? server.moduleGraph;
```

**Status:** Already environment-aware with fallback.

**Note:** Explicitly uses SSR environment for CSS extraction - this is intentional and correct.

---

## Priority 4: Low (Nice to have)

### 4.1 `hotUpdate` Hook Migration

**Current:** Only uses legacy `handleHotUpdate` hook.

**Vite 7+:** Should add `hotUpdate` hook for per-environment HMR handling:

```typescript
hotUpdate: {
  order: 'post',
  handler({ file, modules }) {
    if (this.environment.name === 'client') {
      // Client-specific invalidation
    }
  },
}
```

---

### 4.2 Custom DevEnvironment Classes

**Current:** Uses default Vite dev environments.

**Future Opportunity:** Custom `QwikClientDevEnvironment` and `QwikSSRDevEnvironment` could:

- Encapsulate QRL caching per-environment
- Provide optimized module resolution
- Enable better debugging

**Recommendation:** Start without custom classes, add if needed.

---

## Already Environment-Aware (Good Patterns)

These locations already handle the Environment API correctly:

### Router Plugin Module Graph Access

**File:** `packages/qwik-router/src/buildtime/vite/plugin.ts` (lines 183-195)

```typescript
if (server.environments) {
  for (const env of Object.values(server.environments)) {
    const mod = env.moduleGraph.getModuleById('@qwik-router-config');
    if (mod) env.moduleGraph.invalidateModule(mod);
  }
} else {
  const mod = server.moduleGraph.getModuleById('@qwik-router-config');
  if (mod) server.moduleGraph.invalidateModule(mod);
}
```

### Dev Middleware Module Graph Access

**File:** `packages/qwik-router/src/buildtime/vite/dev-middleware.ts` (line 102)

```typescript
const moduleGraph = server.environments?.ssr?.moduleGraph ?? server.moduleGraph;
```

### Environment Config Reading

**File:** `packages/qwik/src/optimizer/src/plugins/vite.ts` (line 731)

```typescript
const externals = [config.ssr?.noExternal, config.environments?.ssr?.resolve?.noExternal]
  .flat()
  .filter((t) => typeof t === 'string');
```

### Server Detection with Environment API

**File:** `packages/qwik/src/optimizer/src/plugins/plugin.ts` (lines 444-456)

```typescript
const getIsServer = (viteOpts?: { ssr?: boolean }, environment?: Environment): boolean => {
  if (environment?.config?.consumer === 'server') return true;
  if (environment?.name === 'ssr') return true;
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
};
```

---

## Summary: Migration Checklist

| Area                                  | Status             | Priority | Action Required            |
| ------------------------------------- | ------------------ | -------- | -------------------------- |
| `handleHotUpdate` module graph        | ❌ Not env-aware   | P1       | Add environment loop       |
| `ctx.server.hot.send()`               | ❌ Legacy API      | P1       | Use `this.environment.hot` |
| `devServer.moduleGraph` (3 locations) | ❌ Not env-aware   | P1       | Add environment fallback   |
| Manifest build coordination           | ⚠️ File-based      | P2       | Use `builder.buildApp()`   |
| Transform cache isolation             | ⚠️ Shared instance | P2       | Consider WeakMap pattern   |
| Code stripping detection              | ✅ Works           | P2       | Test edge cases            |
| Full-reload HMR                       | ⚠️ Suboptimal      | P3       | Future: granular HMR       |
| Bundle graph adders                   | ⚠️ Shared set      | P3       | Verify idempotency         |
| `hotUpdate` hook                      | ❌ Missing         | P4       | Add for Vite 7+            |
| Router plugin module graph            | ✅ Good            | -        | Reference pattern          |
| Dev middleware module graph           | ✅ Good            | -        | Reference pattern          |
| `getIsServer()` detection             | ✅ Good            | -        | Reference pattern          |

---

## Testing Recommendations

1. **Dev HMR Testing:**
   - Change client-only code → verify only client reloads
   - Change server-only code → verify SSR updates
   - Change shared code → verify both update

2. **Build Order Testing:**
   - Verify client manifest exists before SSR reads it
   - Test `builder.buildApp()` coordination

3. **Rolldown Compatibility:**
   - Verify REPL/playground works without Environment API
   - Test `opts.target` fallback path

4. **Edge Cases:**
   - Multiple client environments (if ever supported)
   - Worker environments (future)
   - Hybrid rendering scenarios
