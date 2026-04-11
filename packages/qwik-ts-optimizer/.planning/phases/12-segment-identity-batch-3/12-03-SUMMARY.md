---
phase: 12-segment-identity-batch-3
plan: 03
subsystem: optimizer
tags: [convergence, param-ordering, slot-allocation, q-p-placement, unused-binding]

# Dependency graph
requires:
  - phase: 12-segment-identity-batch-3
    provides: Loop-aware capture classification, paramNames padding, segment signature rewriting, .w() hoisting, q:p placement, signal dedup
provides:
  - Declaration-order paramNames for event handler captures
  - Shared slot allocation for multi-handler elements
  - q:p/q:ps from capture analysis (not iterVars)
  - Per-QRL var/const prop classification in loop context
  - Unused binding stripping for non-exported component declarations
affects: [13-segment-codegen, 14-segment-codegen, 15-segment-codegen]

# Tech tracking
tech-stack:
  added: []
  patterns: [declaration-position-ordering, shared-slot-allocation, qpOverrides-map, per-qrl-classification]

key-files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/jsx-transform.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/loop-hoisting.ts

key-decisions:
  - "ParamNames ordered by declaration position (source order), not alphabetically"
  - "Shared slot allocation: handlers on same element get unified params with _N gap padding, trailing unused slots omitted"
  - "q:p/q:ps built from capture analysis paramNames (not loopCtx.iterVars) via qpOverrides map"
  - "Per-QRL var/const prop classification: handlers with captures go to varEntries, without to constEntries"
  - "Unused binding stripping gated on minify != 'none' (Rust simplify mode)"
  - "Only immediate loop variables are loop-local; outer loop variables are cross-scope captures via .w()"

patterns-established:
  - "qpOverrides map: AST walking of rewritten segment body to map element positions to capture-derived q:p/q:ps values"
  - "qrlsWithCaptures set: per-QRL capture info threaded through JSX transform for var/const classification"
  - "globalDeclPositions: shared map of variable declaration positions for cross-handler ordering"
  - "elementQpParamsMap: unified q:ps params per element computed after slot allocation"

requirements-completed: [P12-04, P12-05]

# Metrics
duration: 43min
completed: 2026-04-11
---

# Phase 12 Plan 03: Convergence Sweep Summary

**7 of 21 Phase 12 targets passing with declaration-ordered params, shared slot allocation, and capture-driven q:p placement; 14 deferred to codegen phases**

## Performance

- **Duration:** 43 min
- **Started:** 2026-04-11T11:10:34Z
- **Completed:** 2026-04-11T11:53:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ParamNames now ordered by source declaration position instead of alphabetical sort (matching Rust optimizer)
- Shared slot allocation for multiple event handlers on same JSX element with gap padding (_N placeholders)
- No-capture event handlers in loop context get minimal (_, _1) padding
- q:p/q:ps values derived from capture analysis paramNames, not loop iterVars
- Only elements with event handler captures get q:p/q:ps and loop flag (bit 2)
- Per-QRL var/const prop classification: handlers with captures to varEntries, without to constEntries
- Unused binding stripping for non-exported component declarations (gated on minify mode)
- Trailing unused parameter slots omitted (not padded)

## Task Commits

Each task was committed atomically:

1. **Task 1a: Core fixes** - `f7097a5` (feat) - param ordering, slot allocation, q:p generation, parent binding stripping
2. **Task 1b: Per-QRL classification** - `b0a1fdb` (feat) - qpOverrides, per-QRL var/const, flags fix
3. **Task 1c: Loop scope revert** - `9c473a0` (fix) - revert all-loops to immediate-loop-only

## Files Created/Modified
- `src/optimizer/transform.ts` - Declaration-order params, shared slot allocation, globalDeclPositions, elementQpParamsMap, no-capture loop padding, minify threading
- `src/optimizer/segment-codegen.ts` - qpOverrides AST walking for q:p/q:ps placement, qrlsWithCaptures construction, JSXNamespacedName handling
- `src/optimizer/jsx-transform.ts` - qpOverrides/qrlsWithCaptures parameters, per-QRL prop classification, conditional loop flag
- `src/optimizer/rewrite-parent.ts` - Unused binding stripping for extraction-IS-init case, minify parameter
- `src/optimizer/loop-hoisting.ts` - preserveOrder option for buildQpProp

## Decisions Made
- Declaration position ordering is the correct capture ordering for Rust optimizer compatibility (not alphabetical)
- Shared slot allocation only applies to multi-handler elements where captures interleave; handlers that form a contiguous prefix don't need gap padding
- Only immediate loop variables are loop-local (paramNames); outer loop variables are cross-scope captures delivered via .w() hoisting
- q:p/q:ps only on elements with event handler captures; wrapper elements in loops do NOT get loop context
- Unused binding stripping is a minify:'simplify' behavior (not applied with minify:'none')

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ParamNames alphabetical vs declaration order**
- **Found during:** Task 1
- **Issue:** Captures were `.sort()`-ed alphabetically, but Rust optimizer uses declaration position order
- **Fix:** Track declaration positions during scope walking, sort by position instead of name
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** f7097a5

**2. [Rule 1 - Bug] Unused binding not stripped for extraction-IS-init case**
- **Found during:** Task 1
- **Issue:** `const X = component$(...)` where init IS the extraction was not stripped; only nested extractions were handled
- **Fix:** Changed condition to include both nested-in-init and init-IS-extraction cases, gated on minify != 'none'
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Committed in:** f7097a5

**3. [Rule 2 - Missing] No-capture handler loop padding**
- **Found during:** Task 1
- **Issue:** Event handlers with no captures in loop context didn't get (_, _1) padding
- **Fix:** Added check at both undeclaredIds==0 and uniqueCaptures==0 exit points
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** f7097a5

**4. [Rule 2 - Missing] Shared slot allocation for multi-handler elements**
- **Found during:** Task 1
- **Issue:** Multiple handlers on same element had independent param lists instead of unified slots
- **Fix:** Post-processing step groups handlers by element, unions params in declaration order, assigns slots with gap padding
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** f7097a5

**5. [Rule 1 - Bug] q:ps from iterVars instead of capture analysis**
- **Found during:** Task 1
- **Issue:** q:p/q:ps values came from loopCtx.iterVars (loop callback params only), missing block-scoped declarations
- **Fix:** Built qpOverrides map from capture analysis paramNames, injected via JSX transform
- **Files modified:** src/optimizer/segment-codegen.ts, src/optimizer/jsx-transform.ts
- **Committed in:** b0a1fdb

**6. [Rule 3 - Blocking] processProps missing qrlsWithCaptures parameter**
- **Found during:** Task 1
- **Issue:** processProps function didn't receive qrlsWithCaptures, causing ReferenceError
- **Fix:** Added parameter to processProps function signature and call site
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** b0a1fdb

---

**Total deviations:** 6 auto-fixed (3 bugs, 2 missing critical, 1 blocking)
**Impact on plan:** All deviations were necessary for correctness. No scope creep.

## Issues Encountered
- 14 of 21 Phase 12 targets still fail due to pre-existing issues in component segment body generation:
  - JSX whitespace handling (extra space text nodes between sibling elements)
  - TS type annotations not stripped from segment bodies (`Signal` type leaking)
  - Missing non-Qwik imports in segment bodies (e.g., custom components)
  - QRL declaration ordering in segment bodies (disambiguation suffix order)
  - .w() hoisting placement and ordering for cross-scope captures
  - These are all codegen-layer issues that will be addressed in Phases 13-15

## Convergence Results
- **Total convergence tests passing:** 41/210 (was 34)
- **Phase 12 targets passing:** 7/21
- **Previously-locked snapshots:** all 34 still passing (0 regressions)
- **Unit tests:** 522 passing (was 516, +6 from Phase 12)
- **Regressions:** none

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event handler segment identity (params, captures, paramNames) is correct for all 21 Phase 12 targets
- 7 targets fully pass (both parent and segment output match)
- 14 targets fail on component segment body codegen (pre-existing issues)
- Ready for Phase 13+ codegen phases which will address remaining body output issues

---
*Phase: 12-segment-identity-batch-3*
*Completed: 2026-04-11*
