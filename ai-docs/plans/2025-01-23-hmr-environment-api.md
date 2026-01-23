# HMR Environment API Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Qwik's HMR system to use Vite 7+ Environment API for per-environment module graph access and invalidation.

**Architecture:**

1. Add `hotUpdate` hook to vite.ts (Vite 7+ pattern) alongside existing `handleHotUpdate`
2. Update module graph access in plugin.ts to be environment-aware
3. Use `this.environment.hot.send()` for HMR messages in the new hook

**Tech Stack:** Vite 7+ Environment API, TypeScript

**Reference Docs:**

- `ai-docs/research/vite-environment-api/key-areas.md` - Priority list (P1 items)
- `ai-docs/research/vite-environment-api/09-migration-strategy.md` - Phase 4: HMR Migration patterns
- `ai-docs/research/vite-environment-api/08-qwik-requirements.md` - Section 4: hotUpdate Migration

**What's Already Done:**

- ✅ `getViteMajorVersion()` helper in vite.ts
- ✅ Version-gated `environments` config in vite.ts
- ✅ `getIsServer()` with environment detection in plugin.ts
- ✅ Router plugin already has environment-aware pattern (lines 182-195)

---

## Task 1: Add `hotUpdate` Hook to vite.ts

**Files:**

- Modify: `packages/qwik/src/optimizer/src/plugins/vite.ts`

**Context:** From migration-strategy.md Phase 4 - add `hotUpdate` hook for Vite 7+ that uses `this.environment`.

**Step 1: Add `hotUpdate` hook after `handleHotUpdate` (around line 643)**

```typescript
handleHotUpdate(ctx) {
  qwikPlugin.handleHotUpdate(ctx);

  // Tell the client to reload the page if any modules were used in ssr or client
  // this needs to be refined
  if (ctx.modules.length) {
    ctx.server.hot.send({
      type: 'full-reload',
    });
  }
},

// Vite 7+ Environment API: per-environment HMR handling
hotUpdate: {
  order: 'post',
  handler({ file, modules, server }) {
    // Only handle client environment - SSR changes trigger client reload anyway
    if (this.environment?.name !== 'client') {
      return;
    }

    // Delegate to plugin's HMR handler for cache invalidation
    qwikPlugin.handleHotUpdate({
      file,
      modules,
      server,
      read: () => Promise.resolve(''),
    } as any);

    // Trigger full reload via environment-specific hot channel
    if (modules.length) {
      this.environment.hot.send({ type: 'full-reload' });
      return []; // Prevent default HMR, we handled it
    }
  },
},
```

**Step 2: Run type check**

Run: `pnpm tsc --noEmit -p packages/qwik/tsconfig.json`
Expected: No errors (may need to add types)

**Step 3: Commit**

```bash
git add packages/qwik/src/optimizer/src/plugins/vite.ts
git commit -m "feat(vite): add hotUpdate hook for Vite 7+ Environment API"
```

---

## Task 2: Add Environment-Aware Module Invalidation Helper

**Files:**

- Modify: `packages/qwik/src/optimizer/src/plugins/plugin.ts`

**Context:** From key-areas.md - `handleHotUpdate` uses `ctx.server.moduleGraph` directly. Need helper that works with all environments.

**Step 1: Add helper function after line ~1054 (after handleHotUpdate)**

```typescript
/**
 * Invalidate a module across all environments (Vite 7+) or legacy module graph. Pattern from
 * qwik-router/plugin.ts lines 182-195.
 */
function invalidateModuleInEnvironments(server: ViteDevServer, moduleId: string): void {
  if (server.environments) {
    // Vite 7+: Invalidate in all environments
    for (const env of Object.values(server.environments)) {
      const mod = (env as any).moduleGraph?.getModuleById(moduleId);
      if (mod) {
        (env as any).moduleGraph.invalidateModule(mod);
      }
    }
  } else {
    // Legacy fallback
    const mod = server.moduleGraph.getModuleById(moduleId);
    if (mod) {
      server.moduleGraph.invalidateModule(mod);
    }
  }
}
```

**Step 2: Update handleHotUpdate to use helper (lines 1045-1048)**

Change:

```typescript
const mod = ctx.server.moduleGraph.getModuleById(key);
if (mod) {
  ctx.server.moduleGraph.invalidateModule(mod);
}
```

To:

```typescript
invalidateModuleInEnvironments(ctx.server, key);
```

**Step 3: Run type check**

Run: `pnpm tsc --noEmit -p packages/qwik/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/qwik/src/optimizer/src/plugins/plugin.ts
git commit -m "feat(vite): add environment-aware module invalidation in HMR"
```

---

## Task 3: Add Module Graph Read Helper

**Files:**

- Modify: `packages/qwik/src/optimizer/src/plugins/plugin.ts`

**Context:** From key-areas.md 1.3 - three locations use `devServer.moduleGraph.getModuleById()` directly.

**Step 1: Add helper function after `invalidateModuleInEnvironments`**

```typescript
/**
 * Get a module from the appropriate module graph. Prefers client environment graph in Vite 7+,
 * falls back to legacy shared graph.
 */
function getModuleById(
  server: ViteDevServer,
  moduleId: string
): { file?: string; url?: string } | undefined {
  // Vite 7+: prefer client environment
  const clientEnv = (server as any).environments?.client;
  if (clientEnv?.moduleGraph) {
    return clientEnv.moduleGraph.getModuleById(moduleId);
  }
  // Legacy fallback
  return server.moduleGraph.getModuleById(moduleId);
}
```

**Step 2: Update resolveId usage (line ~492)**

Change:

```typescript
const file = devServer!.moduleGraph.getModuleById(resolved.id)?.file;
```

To:

```typescript
const file = getModuleById(devServer!, resolved.id)?.file;
```

**Step 3: Update load usage (line ~708)**

Change:

```typescript
const parentModule = devServer.moduleGraph.getModuleById(parentId);
```

To:

```typescript
const parentModule = getModuleById(devServer, parentId);
```

**Step 4: Update transform usage (line ~793)**

Change:

```typescript
devPath = devServer.moduleGraph.getModuleById(pathId)?.url;
```

To:

```typescript
devPath = getModuleById(devServer, pathId)?.url;
```

**Step 5: Run type check**

Run: `pnpm tsc --noEmit -p packages/qwik/tsconfig.json`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/qwik/src/optimizer/src/plugins/plugin.ts
git commit -m "feat(vite): use environment-aware module graph reads"
```

---

## Task 4: Run Tests and Verify

**Step 1: Run unit tests**

Run: `pnpm test.unit qwik -- --testPathPattern="vite.unit"`
Expected: All 20 tests pass

**Step 2: Run full test suite**

Run: `pnpm test.unit qwik`
Expected: All tests pass

**Step 3: Type check**

Run: `pnpm tsc --noEmit -p packages/qwik/tsconfig.json`
Expected: No errors

---

## Task 5: Update key-areas.md Checklist

**Files:**

- Modify: `ai-docs/research/vite-environment-api/key-areas.md`

**Step 1: Update Summary table**

Change P1 items from ❌ to ✅:

| Area                                  | Status  | Priority | Action Required        |
| ------------------------------------- | ------- | -------- | ---------------------- |
| `handleHotUpdate` module graph        | ✅ Done | P1       | Environment loop added |
| `ctx.server.hot.send()`               | ✅ Done | P1       | `hotUpdate` hook added |
| `devServer.moduleGraph` (3 locations) | ✅ Done | P1       | Helper function added  |
| `hotUpdate` hook                      | ✅ Done | P4       | Added to vite.ts       |

**Step 2: Commit**

```bash
git add ai-docs/research/vite-environment-api/key-areas.md
git commit -m "docs: mark HMR migration complete in key-areas.md"
```

---

## Verification

1. **Type Safety:** `pnpm tsc --noEmit -p packages/qwik/tsconfig.json`
2. **Unit Tests:** `pnpm test.unit qwik`
3. **Manual Test (with Vite 7+ project):**
   - Start dev server
   - Edit component → verify page reloads
   - Check console for no moduleGraph errors

---

## Future Work (Not This Plan)

- **Granular HMR (P3):** Replace full-reload with CSS/QRL-specific updates
- **Per-Environment Caches (P2):** WeakMap pattern for transform output isolation
