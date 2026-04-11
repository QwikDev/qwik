---
phase: 20-migration-and-sync-convergence
plan: 02
subsystem: optimizer
tags: [sync-qrl, jsx-classification, const-idents, segment-codegen]

requires:
  - phase: 20-migration-and-sync-convergence
    provides: Variable migration scope-aware filtering, movedDeclarations with import deps
provides:
  - Proper _qrlSync serialization with minified string argument in segment bodies
  - classifyProp const_idents special-casing for Qwik internal calls
affects: [convergence, jsx-transform, segment-codegen]

tech-stack:
  added: []
  patterns: [paren-depth-aware sync$ parsing in segment bodies, CONST_CALL_IDENTS set for classifyProp]

key-files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
    - src/optimizer/jsx-transform.ts

key-decisions:
  - "Reuse buildSyncTransform from rewrite-calls.ts for segment body sync$ replacement instead of naive regex"
  - "CONST_CALL_IDENTS hardcoded set matching SWC const_idents: _qrlSync, _wrapProp, _wrapSignal, _fnSignal, qrl, inlinedQrl, _noopQrl"

patterns-established:
  - "Paren-depth-aware parsing: track depth to handle nested parens, skip string/template literals when extracting sync$ arguments"
  - "CONST_CALL_IDENTS pattern: known Qwik internal calls classified as const in classifyProp for correct constProps placement"

requirements-completed: [SYNC-01]

duration: 6min
completed: 2026-04-11
---

# Phase 20 Plan 02: Sync QRL Serialization and Const Classification Summary

**_qrlSync segment body serialization with minified string argument via buildSyncTransform, plus CONST_CALL_IDENTS in classifyProp for correct constProps placement**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-11T21:45:46Z
- **Completed:** 2026-04-11T21:51:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced naive `sync$( -> _qrlSync(` regex in segment-codegen.ts with paren-depth-aware parser that extracts function arguments and calls `buildSyncTransform` to produce `_qrlSync(fn, "minified")`
- Added CONST_CALL_IDENTS set to classifyProp so _qrlSync, _wrapProp, _wrapSignal, _fnSignal, qrl, inlinedQrl, and _noopQrl calls are classified as const instead of var
- Convergence: 76/210 (zero regressions from baseline)
- TypeScript compilation clean (0 errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix _qrlSync serialization in segment bodies using buildSyncTransform** - `0124091` (feat)
2. **Task 2: Special-case _qrlSync and _wrapProp as const in classifyProp** - `0405ef0` (feat)

## Files Created/Modified
- `src/optimizer/segment-codegen.ts` - Replaced naive sync$ regex with paren-depth-aware parser using buildSyncTransform; added buildSyncTransform import from rewrite-calls.ts
- `src/optimizer/jsx-transform.ts` - Added CONST_CALL_IDENTS set in classifyProp CallExpression case; _qrlSync and other Qwik internal calls now return 'const'

## Decisions Made
- Reused buildSyncTransform from rewrite-calls.ts rather than implementing separate minification logic in segment-codegen.ts -- same function already works correctly for parent-level sync$ calls
- CONST_CALL_IDENTS is a hardcoded set matching SWC's const_idents per research assumption A1 -- full const_idents tracking (for arbitrary user-declared const bindings) remains deferred to a future phase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- _qrlSync serialization now includes minified string in both parent and segment bodies
- classifyProp correctly identifies Qwik internal calls as const-valued
- The sync snapshot (example_of_synchronous_qrl) still fails convergence due to other issues (JSX prop placement, flags bitmask) that are separate from the _qrlSync serialization and const classification work done here
- Ready for next convergence phase addressing remaining failure families

---
*Phase: 20-migration-and-sync-convergence*
*Completed: 2026-04-11*
