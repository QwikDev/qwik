# Quick Task 001: Fix ESLint Curly Brace Error

## Task Description

Fix ESLint `curly` rule violation in `packages/qwik/src/optimizer/src/plugins/vite.ts` at line 48.

## Error

```
/home/runner/work/qwik/qwik/packages/qwik/src/optimizer/src/plugins/vite.ts
Error:   48:21  error  Expected { after 'if' condition  curly
```

## Tasks

### Task 1: Add curly braces to if statement

**File:** `packages/qwik/src/optimizer/src/plugins/vite.ts`
**Line:** 48

**Before:**
```typescript
if (!viteVersion) return 0;
```

**After:**
```typescript
if (!viteVersion) {
  return 0;
}
```

## Verification

Run `pnpm run lint.eslint` - should pass without errors.
