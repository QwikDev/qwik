---
phase: 12-segment-identity-batch-3
plan: 01
subsystem: optimizer
tags: [captures, loop-detection, event-handlers, paramNames, segment-codegen]

# Dependency graph
requires:
  - phase: 04-jsx-transforms
    provides: loop-hoisting module with detectLoopContext, findEnclosingLoop, generateParamPadding
  - phase: 03-capture-analysis
    provides: analyzeCaptures, collectScopeIdentifiers, getUndeclaredIdentifiersInFunction
provides:
  - Loop-aware event handler capture-to-param promotion in transform pipeline
  - Segment function signature rewriting with paramNames padding
affects: [13-segment-codegen, 14-segment-codegen, 15-segment-codegen]

# Tech tracking
tech-stack:
  added: []
  patterns: [event-handler-capture-promotion, loop-scope-walking, signature-rewriting]

key-files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/segment-codegen.ts

key-decisions:
  - "Event handler captures from immediate parent scope become paramNames with _,_1 padding (not just loop contexts)"
  - "Re-detect captures from intermediate scopes (e.g., .map() callbacks) that standard capture analysis misses"
  - "Loop-local vs cross-scope partition: only immediate loop's iterVars and body declarations are loop-local"

patterns-established:
  - "collectBindingNamesFromNode: reusable helper for extracting binding names from AST patterns into a Set"
  - "AST scope walking for intermediate functions: walk enclosing extraction body to find function scopes containing extraction"

requirements-completed: [P12-01, P12-03]

# Metrics
duration: 11min
completed: 2026-04-11
---

# Phase 12 Plan 01: Loop-Aware Capture Classification Summary

**Event handler capture-to-param promotion with loop-aware partitioning and segment signature rewriting for q:p parameter delivery**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-11T10:32:43Z
- **Completed:** 2026-04-11T10:43:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Event handler captures correctly promoted to paramNames with ["_", "_1", ...vars] padding for both loop and non-loop contexts
- Loop-aware partitioning: immediate loop iter vars and block-scoped declarations become paramNames (q:p delivery), outer scope vars become captureNames (_captures delivery)
- Segment function signatures rewritten from `() => body` to `(_, _1, loopVar) => body` when paramNames has padding pattern
- All three target snapshot segments produce correct metadata (captures, captureNames, paramNames) and correct code output

## Task Commits

Each task was committed atomically:

1. **Task 1: Loop-aware capture classification in transform pipeline** - `a248035` (feat)
2. **Task 2: Segment signature rewriting with paramNames padding** - `8b8a6e4` (feat)

## Files Created/Modified
- `src/optimizer/transform.ts` - Added loop-aware event handler capture-to-param promotion with AST scope walking for intermediate functions, extractionLoopMap for loop context tracking, and collectBindingNamesFromNode helper
- `src/optimizer/segment-codegen.ts` - Added rewriteFunctionSignature function and paramNames-triggered signature rewriting before export line emission

## Decisions Made
- Event handler capture promotion applies to ALL event handlers, not just those in loops. Non-loop handlers have all captures promoted to paramNames. Loop handlers partition into loop-local (paramNames) and cross-scope (captureNames).
- Standard capture analysis misses variables from intermediate scopes (e.g., .map() callback params/locals). Added AST walking to collect scope-visible identifiers from all enclosing functions between the extraction and its parent extraction boundary.
- Signature rewriting uses findArrowIndex (already existing in segment-codegen) to locate arrow functions, then rewrites the parameter list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Re-detect captures from intermediate scopes**
- **Found during:** Task 1
- **Issue:** Standard capture analysis uses the enclosing extraction's body scope as parentScopeIdentifiers, but variables declared in intermediate functions (like .map() callbacks) are not in that scope. Event handler captures from loop callbacks (e.g., `index` in `arr.map((val, i) => { const index = i+1; ... })`) were not detected.
- **Fix:** Added AST walking to collect identifiers from ALL function scopes between the extraction and its enclosing extraction. This catches loop callback params (val, i) and body declarations (index).
- **Files modified:** src/optimizer/transform.ts
- **Verification:** Debug test confirmed `index`, `row`, `item` all correctly detected as captures
- **Committed in:** a248035

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without intermediate scope walking, loop variable captures would never be detected. No scope creep.

## Issues Encountered
- Convergence tests for target snapshots still fail due to unrelated parent segment code mismatches (import ordering). The event handler segment metadata and code are correct. These parent segment issues are pre-existing and will be addressed in future phases.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Loop-aware capture classification is complete and ready for Phase 12 Plans 02-03
- Segment signature rewriting works for all loop patterns (simple, nested, block-scoped)
- 34 convergence tests passing (no regressions from 34 baseline)

---
*Phase: 12-segment-identity-batch-3*
*Completed: 2026-04-11*
