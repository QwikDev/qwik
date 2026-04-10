---
phase: 04-jsx-signals-and-event-handlers
plan: 04
subsystem: optimizer
tags: [loop-hoisting, qrl, event-handlers, qp, qps, positional-params]

# Dependency graph
requires:
  - phase: 04-03
    provides: "bind-transform for event handler desugaring"
provides:
  - "Loop detection for all 6 loop types (map, for-i, for-of, for-in, while, do-while)"
  - ".w([captures]) hoisting plan generation"
  - "q:p/q:ps prop injection for loop iteration variables"
  - "Positional parameter padding (_, _1, loopVars)"
  - "analyzeLoopHandler combining all loop hoisting concerns"
affects: [04-05, pipeline-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Loop context detection via AST node type switching", "Hoisting plan as data (not immediate mutation)", "Alphabetical sort for q:ps multi-var props"]

key-files:
  created:
    - src/optimizer/loop-hoisting.ts
    - tests/optimizer/loop-hoisting.test.ts
  modified: []

key-decisions:
  - "Loop hoisting produces plan objects (HoistingPlan, LoopHoistResult) rather than performing mutations directly -- pipeline integration in Plan 05 will consume these plans"
  - "generateParamPadding always produces ['_', '_1'] base padding matching snapshot corpus pattern for event + context params"
  - "q:ps values sorted alphabetically matching Rust optimizer behavior verified from nested loop snapshot"

patterns-established:
  - "Loop detection via AST node type: ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement, and CallExpression with .map() callee"
  - "Hoisting plan pattern: pure data returned, caller responsible for magic-string insertion"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05]

# Metrics
duration: 3min
completed: 2026-04-10
---

# Phase 04 Plan 04: Loop Hoisting Summary

**Loop detection for all 6 loop types with .w() hoisting plans, q:p/q:ps injection, and positional parameter padding matching snapshot corpus patterns**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T21:04:28Z
- **Completed:** 2026-04-10T21:07:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built loop detection covering all 6 loop types (map, for-i, for-of, for-in, while, do-while)
- Implemented .w([captures]) hoisting plan generation with correct declaration format
- Added q:p (single var) and q:ps (multiple vars, alphabetically sorted) prop builders
- Generated positional parameter padding matching snapshot patterns (_, _1, loopVars)
- Created analyzeLoopHandler combining all concerns with flags bit 2 (value 4)
- 31 unit tests including snapshot pattern matching against real corpus data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create loop-hoisting.ts with loop detection and .w() hoisting** - `d881129` (feat)
2. **Task 2: Add q:p/q:ps injection and positional parameter padding** - `2943031` (feat)

## Files Created/Modified
- `src/optimizer/loop-hoisting.ts` - Loop detection, .w() hoisting, q:p/q:ps, param padding, analyzeLoopHandler
- `tests/optimizer/loop-hoisting.test.ts` - 31 unit tests covering all loop types and snapshot patterns

## Decisions Made
- Loop hoisting produces plan objects (HoistingPlan, LoopHoistResult) rather than performing mutations -- pipeline will consume these in Plan 05
- generateParamPadding always produces ['_', '_1'] base padding matching snapshot corpus
- q:ps values sorted alphabetically matching Rust optimizer behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Loop hoisting module ready for pipeline integration in Plan 05
- All exported functions (detectLoopContext, hoistEventCaptures, findEnclosingLoop, generateParamPadding, buildQpProp, analyzeLoopHandler) available for import
- Plan objects designed for magic-string consumption in the transform pipeline

---
*Phase: 04-jsx-signals-and-event-handlers*
*Completed: 2026-04-10*
