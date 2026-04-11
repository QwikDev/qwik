---
phase: 12-segment-identity-batch-3
plan: 02
subsystem: optimizer
tags: [w-hoisting, q-p-placement, signal-dedup, component-events, captures]

# Dependency graph
requires:
  - phase: 12-segment-identity-batch-3
    provides: Loop-aware capture classification, paramNames padding, segment signature rewriting
provides:
  - .w() hoisting in parent segment body for cross-scope loop captures
  - Correct q:p placement in varEntries for loop context elements
  - Signal hoisted function deduplication across segments
  - Component element event name preservation (onClick$ not q-e:click)
affects: [13-segment-codegen, 14-segment-codegen, 15-segment-codegen]

# Tech tracking
tech-stack:
  added: []
  patterns: [w-hoisting-injection, expression-to-block-body-conversion, signal-dedup-map]

key-files:
  created: []
  modified:
    - src/optimizer/extract.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/jsx-transform.ts
    - src/optimizer/signal-analysis.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts
    - tests/optimizer/transform.test.ts

key-decisions:
  - "q:p goes to varEntries (not constEntries) matching Rust optimizer behavior for loop context elements"
  - "Pre-rewritten q-e:* props go to varEntries in loop context to match Rust prop classification"
  - "_fnSignal children classified as dynamic (not static) to produce correct flags"
  - ".w() hoisting converts expression arrow bodies to block bodies for declaration injection"
  - "Signal dedup uses function body text as key for Map-based deduplication"

patterns-established:
  - "isComponentEvent flag on ExtractionResult: detects uppercase JSX tag for event handler classification"
  - "findEnclosingArrowBodyForCapture: scan backwards for arrow function with specific param name"
  - "Expression-to-block body conversion: (expr) -> { decl; return expr; } for .w() injection"

requirements-completed: [P12-02, P12-04]

# Metrics
duration: 21min
completed: 2026-04-11
---

# Phase 12 Plan 02: .w() Hoisting and Signal Dedup Summary

**Cross-scope loop capture hoisting with .w() declarations, q:p varEntries placement, signal function deduplication, and component event name preservation**

## Performance

- **Duration:** 21 min
- **Started:** 2026-04-11T10:46:20Z
- **Completed:** 2026-04-11T11:07:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Parent segment bodies generate .w([captureVar]) hoisting declarations for cross-scope captures in nested loops
- Arrow expression bodies converted to block bodies to support .w() declaration injection
- q:p prop placed in varEntries (matching Rust optimizer) when loop context is active
- Pre-rewritten q-e:* event props classified as var in loop context elements
- Component elements (uppercase JSX tags) preserve original event names (onClick$) in segment bodies
- Identical hoisted signal functions (_hf) deduplicated across a segment via Map-based lookup
- _fnSignal children correctly classified as dynamic for proper flags computation
- _captures injection verified working alongside paramNames padding for cross-scope loop segments

## Task Commits

Each task was committed atomically:

1. **Task 1: .w() hoisting, q:p placement, component event names** - `6cab24c` (feat)
2. **Task 2: Signal hoisted function deduplication** - `4637a1a` (feat)

## Files Created/Modified
- `src/optimizer/extract.ts` - Added isComponentEvent flag to ExtractionResult, set during JSX attribute extraction
- `src/optimizer/rewrite-parent.ts` - Component event name preservation and .w() hoisting for inline strategy
- `src/optimizer/jsx-transform.ts` - q:p to varEntries, q-e:* to varEntries in loop context, _fnSignal dynamic classification, inLoop param for processProps
- `src/optimizer/signal-analysis.ts` - SignalHoister dedup map for identical function body reuse
- `src/optimizer/segment-codegen.ts` - .w() hoisting injection via findEnclosingArrowBodyForCapture, expression-to-block body conversion
- `src/optimizer/transform.ts` - Component event prop name preservation, cross-scope loop capture detection for NestedCallSiteInfo
- `tests/optimizer/transform.test.ts` - Updated loop transform test regex for new q:p placement in varEntries

## Decisions Made
- q:p placed in varEntries because loop variable values are dynamic -- all props on loop-context elements go to varEntries to match Rust optimizer behavior
- _fnSignal children classified as dynamic (not static) because they wrap reactive signal expressions that can change at runtime
- Signal dedup uses the raw function body text as the deduplication key since syntactically identical functions are semantically identical
- .w() hoisting finds the target arrow function by parameter name matching (the captured variable must be a parameter of the enclosing arrow)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] inLoop variable scope error in processProps**
- **Found during:** Task 1
- **Issue:** The `inLoop` variable was referenced in `processProps` function but defined in `transformJsxElement` (different scope). Adding q-e:* to varEntries in loop context required `inLoop` in `processProps`.
- **Fix:** Added `inLoop` parameter to `processProps` function and passed it from `transformJsxElement`
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** 6cab24c

**2. [Rule 1 - Bug] _fnSignal children incorrectly classified as static**
- **Found during:** Task 1
- **Issue:** _fnSignal-wrapped children in JSX were classified as `type: 'static'` which set the static children flag (bit 1). This produced flags=6 instead of expected flags=4.
- **Fix:** Changed _fnSignal children classification from 'static' to 'dynamic'
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** 6cab24c

**3. [Rule 1 - Bug] .w() hoisting found wrong enclosing arrow function**
- **Found during:** Task 1
- **Issue:** Initial findEnclosingArrowBody scanned backwards and found the closest `=> (` pattern, which was the inner map callback (item), not the outer one (row) where the captured variable is available.
- **Fix:** Rewrote as findEnclosingArrowBodyForCapture which checks parameter names to find the arrow function that provides the specific captured variable
- **Files modified:** src/optimizer/segment-codegen.ts
- **Committed in:** 6cab24c

**4. [Rule 3 - Blocking] Segment JSX transform failing silently**
- **Found during:** Task 1
- **Issue:** Segment body JSX transform was silently failing because `inLoop` was not defined, falling back to raw JSX output. The catch block swallowed the error.
- **Fix:** Fixed by adding inLoop parameter to processProps (same as deviation 1)
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** 6cab24c

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All deviations were necessary for correctness. No scope creep.

## Issues Encountered
- Component segment (Foo_component_HTDRsvUbLiE) AST comparison still fails due to remaining differences (import ordering, TS type annotations not stripped). These are pre-existing issues not introduced by this plan.
- The should_not_transform_events_on_non_elements component segment fails due to missing component imports (CustomComponent, AnotherComponent) in segment output -- a pre-existing import collection issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- .w() hoisting, q:p placement, and signal dedup are implemented and verified
- 34 convergence tests passing (no regressions from baseline)
- 516 unit tests passing (+1 from baseline)
- Ready for Phase 12 Plan 03

---
*Phase: 12-segment-identity-batch-3*
*Completed: 2026-04-11*
