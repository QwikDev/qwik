---
phase: 02-core-extraction-pipeline
plan: 04
subsystem: optimizer
tags: [parent-rewrite, magic-string, qrl-declarations, import-management, nested-segments]

requires:
  - phase: 02-plan-01
    provides: "types, rewriteImportSource()"
  - phase: 02-plan-02
    provides: "ContextStack, marker detection (collectImports, isMarkerCall)"
  - phase: 02-plan-03
    provides: "extractSegments(), ExtractionResult, rewrite-calls utilities"
provides:
  - "rewriteParentModule() - parent module rewriting engine using magic-string"
  - "ParentRewriteResult interface - rewritten code + updated extractions"
  - "Nested extraction detection with parent-child relationships"
affects:
  - "src/optimizer/extract.ts - ExtractionResult.parent field now populated by rewriteParentModule"

tech-stack:
  added: []
  patterns:
    - "magic-string overwrite() for surgical AST-position-based text replacement"
    - "magic-string prepend() for optimizer-added imports and QRL declarations"
    - "Nesting detection via call range containment (inner callStart >= outer argStart)"

key-files:
  created:
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/rewrite-parent.test.ts
  modified: []

decisions:
  - "Only top-level extractions have call sites rewritten in parent module; nested calls are inside segment bodies"
  - "Nesting detected by range containment: if extraction A's call range is within extraction B's argument range, A is nested"
  - "Custom inlined functions (useMemo$ via wrap pattern) do NOT get Qrl import added since the Qrl variant is locally defined"
  - "Import specifier removal rebuilds the import statement rather than trying to surgically edit individual specifiers"

metrics:
  duration: "3min"
  completed: "2026-04-10"
  tasks: 1
  files: 2
  tests_added: 12
  tests_total: 139
---

# Phase 02 Plan 04: Parent Module Rewriting Summary

Parent module rewriting engine using magic-string for surgical text replacement at AST positions, handling all call form variants with proper import management and nested segment detection.

## What Was Done

### Task 1: Parent module rewriting with magic-string (TDD)

Implemented `rewriteParentModule()` in `src/optimizer/rewrite-parent.ts` with complete parent module transformation:

**Call site rewriting:**
- Bare `$()` calls replaced directly with `q_symbolName` (no wrapper)
- Named markers (`component$`, `useTask$`) rewritten to `componentQrl(q_symbolName)`, `useTaskQrl(q_symbolName)`
- `sync$` calls replaced inline with `_qrlSync(original, "minified")` (no QRL declaration)
- `/*#__PURE__*/` annotations added to `componentQrl` calls but not `useTaskQrl`

**Import management (IMP-04, IMP-06):**
- Optimizer-added imports as separate statements (one per symbol)
- Existing `@builder.io/*` imports rewritten to `@qwik.dev/*`
- Marker import specifiers (`component$`, `$`, etc.) removed from existing imports
- Mixed imports preserved (e.g., `{component$, useStore}` becomes `{useStore}`)
- Import deduplication prevents adding already-imported symbols

**Nested segment handling (EXTRACT-03):**
- Detects nesting via call range containment
- Sets `parent` field on nested ExtractionResult objects
- Only rewrites top-level call sites in parent (nested calls are inside segment bodies)

**Output structure:**
```
[optimizer-added imports]
//
[sorted QRL declarations]
//
[rewritten module body]
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] magic-string overlap conflict for nested calls**
- **Found during:** Task 1 GREEN phase
- **Issue:** Nested `$()` inside `component$()` body caused magic-string "Cannot split already edited chunk" error when both call sites were overwritten
- **Fix:** Added nesting detection (range containment) and only rewrite top-level call sites; nested calls exist within the segment body, not the parent module
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** f8cab91

**2. [Rule 1 - Bug] Test 7 had useTask$ nested inside component$ body**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test expected `useTaskQrl` in parent output, but useTask$ was nested inside component$ so it wouldn't appear in parent
- **Fix:** Changed test to have component$ and useTask$ as separate top-level calls
- **Files modified:** tests/optimizer/rewrite-parent.test.ts
- **Commit:** f8cab91

**3. [Rule 3 - Blocking] TypeScript type narrowing for oxc-parser AST nodes**
- **Found during:** Task 1 GREEN phase
- **Issue:** `spec.imported.name` fails TS check because ImportDeclarationSpecifier union type includes ImportDefaultSpecifier which lacks `imported`
- **Fix:** Used `(spec as any).imported?.name` with optional chaining after type guard
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** f8cab91

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 054c0e0 | test | Add failing tests for parent module rewriting (12 tests) |
| f8cab91 | feat | Implement parent module rewriting with magic-string |

## Self-Check: PASSED
