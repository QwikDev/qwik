# Quick Task 002: Fix QRL Parent Module Resolution

**Date:** 2026-01-24
**Status:** Complete
**Commit:** 39f2080f6

## Problem

When running the dev server, modules were not found in the build graph:
```
load(408) module /virtual-qwik-devtools.ts does not exist in the build graph!
load(409) module /packages/qwik-router/lib/index.qwik.mjs does not exist in the build graph!
```

## Root Cause

Two issues combined:

1. **Environment Context Issue:** The `getModuleById()` helper always queried the **client** environment's module graph, even when the `load()` hook was processing a request in the **SSR** environment.

2. **Timing Issue:** QRL segments were being requested before their parent modules had been added to Vite's module graph. The code needed the parent's URL from the module graph to call `transformRequest`, but if the module wasn't there yet, it would fail.

## Solution

Following Vite 7+ patterns documented in `ai-docs/research/vite-environment-api/`:

1. **Use environment's module graph directly:** In plugin hooks, use `ctx?.environment?.moduleGraph?.getModuleById()` when available, falling back to the legacy helper.

2. **Handle modules not in graph:** When parent module isn't found in the module graph, construct a URL using Vite's `/@fs/` prefix for absolute filesystem paths. This allows `transformRequest` to work directly.

3. **Handle virtual modules:** Virtual modules like `/virtual-qwik-devtools.ts` are passed through as-is since they're not filesystem paths.

## Code Change

```typescript
// Determine the URL to use for transformRequest
let transformUrl: string;
if (parentModule?.url) {
  // Module found in graph - use its URL
  transformUrl = parentModule.url;
} else if (parentId.startsWith('/virtual-') || parentId.startsWith('\0')) {
  // Virtual modules - use as-is
  transformUrl = parentId;
} else {
  // Real file not in graph yet - use /@fs/ prefix for absolute paths
  transformUrl = parentId.startsWith('/') ? `/@fs${parentId}` : `/@fs/${parentId}`;
}

await devServer.transformRequest(transformUrl);
```

## Files Modified

- `packages/qwik/src/optimizer/src/plugins/plugin.ts`

## Verification

- All 110 unit test files pass (2067 tests)
- Docs dev server starts without "does not exist in the build graph" errors
- Page loads and renders correctly (verified with agent-browser)

## References

- `ai-docs/research/vite-environment-api/01-vite-core-api.md`
- `ai-docs/research/vite-environment-api/09-migration-strategy.md`
- Vite's `/@fs/` prefix for absolute path access
