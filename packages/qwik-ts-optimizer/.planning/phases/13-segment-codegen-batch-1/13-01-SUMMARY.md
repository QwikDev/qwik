---
phase: 13-segment-codegen-batch-1
plan: 01
subsystem: optimizer
tags: [segment-codegen, rawProps, sync$, ts-stripping, dead-code-elimination]

requires:
  - phase: 12-convergence-loop-hoisting
    provides: "Loop hoisting and segment codegen pipeline"
provides:
  - "_rawProps transform exported and applied in segment codegen"
  - "sync$ to _qrlSync conversion in segment bodies"
  - "TS type stripping for segment code via oxcTransformSync"
  - "if(false) dead code elimination in segment bodies"
  - "Consistent // separator between imports and body in segment output"
affects: [13-02, 13-03, segment-codegen]

tech-stack:
  added: []
  patterns: ["oxcTransformSync for segment-level TS stripping", "dead code regex for if(false) blocks"]

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "applyRawPropsTransform applied BEFORE nested call rewriting and JSX transform in segment codegen"
  - "TS stripping for segments uses same oxcTransformSync pattern as parent module"
  - "Dead code elimination uses simple regex for single-level if(false) blocks"

patterns-established:
  - "Segment body transform pipeline: rawProps -> nested calls -> JSX -> sync$ -> captures -> signature rewrite"

requirements-completed: []

duration: 2min
completed: 2026-04-11
---

# Phase 13 Plan 01: Segment Body Transforms Summary

**_rawProps destructuring, sync$/qrlSync conversion, TS type stripping, and if(false) dead code elimination applied to segment codegen pipeline -- 3 new convergence tests passing (41 -> 44)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-11T12:24:04Z
- **Completed:** 2026-04-11T12:26:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Exported applyRawPropsTransform from rewrite-parent.ts and integrated into segment codegen pipeline
- Added sync$() to _qrlSync() transformation with automatic import injection in segment bodies
- Added TS type stripping for segment code using oxcTransformSync when transpileTs is enabled
- Added dead code elimination stripping if(false) blocks from segment bodies
- Normalized // separator to ensure consistent placement between imports and body
- 3 additional convergence tests now passing (41 -> 44 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Export applyRawPropsTransform and apply it in segment-codegen plus sync$ and separator fixes** - `15f884f` (feat)
2. **Task 2: Add TS type stripping and dead code elimination for segment code in transform.ts** - `e71966e` (feat)

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Exported applyRawPropsTransform function (was private)
- `src/optimizer/segment-codegen.ts` - Added rawProps transform, sync$/qrlSync conversion, separator normalization
- `src/optimizer/transform.ts` - Added oxcTransformSync import, shouldTranspileTs flag, TS stripping and if(false) dead code elimination for segment code

## Decisions Made
- applyRawPropsTransform placed before nested call rewriting to ensure destructured params are replaced before any body transforms
- TS stripping for segments mirrors the exact same pattern used in parent module (rewrite-parent.ts line 1499-1510)
- Dead code elimination uses simple single-level regex -- sufficient for the if(false) patterns seen in snapshots

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Segment codegen pipeline now handles body transforms for _rawProps, sync$, TS types, and dead code
- 44 convergence tests passing as new baseline
- Ready for 13-02 and 13-03 plans to address remaining segment codegen issues

## Self-Check: PASSED

---
*Phase: 13-segment-codegen-batch-1*
*Completed: 2026-04-11*
