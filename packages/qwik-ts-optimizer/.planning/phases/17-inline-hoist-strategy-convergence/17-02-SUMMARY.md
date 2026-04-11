---
phase: 17-inline-hoist-strategy-convergence
plan: 02
subsystem: optimizer
tags: [signal-hoisting, _hf-deduplication, inline-hoist-strategy, convergence]

# Dependency graph
requires:
  - phase: 17-01
    provides: Import ordering fix (Map insertion order)
provides:
  - Shared SignalHoister across inline/hoist body transforms for _hf deduplication
affects: [inline-hoist snapshots, convergence tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [Shared SignalHoister instance across body transforms for counter continuity]

key-files:
  created: []
  modified: [src/optimizer/rewrite-parent.ts, src/optimizer/jsx-transform.ts]

key-decisions:
  - "Shared SignalHoister passed through transformSCallBody to transformAllJsx for _hf counter continuity"
  - "Reverted _captures import suppression for inline strategy -- inline .s() bodies DO use _captures for non-event-handler captures"

patterns-established:
  - "SignalHoister sharing: create once in isInline block, pass to all body transforms, collect declarations at end"

requirements-completed: [IHS-01, IHS-02, IHS-03]

# Metrics
duration: 4min
completed: 2026-04-11
---

# Phase 17 Plan 02: Shared SignalHoister and _hf Deduplication Summary

**Shared SignalHoister across inline/hoist body transforms prevents _hf counter duplication; _captures suppression reverted after regression detected**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-11T18:28:31Z
- **Completed:** 2026-04-11T18:32:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added optional `sharedSignalHoister` parameter to `transformAllJsx` in jsx-transform.ts
- Created shared `SignalHoister` instance in rewrite-parent.ts `isInline` block
- Passed shared hoister through `transformSCallBody` -> `transformAllJsx` call chain
- After all body transforms, replaced per-body _hf declarations with deduplicated set from shared hoister
- Imported `SignalHoister` class into rewrite-parent.ts
- All 73 previously-passing convergence tests maintained (zero regressions)
- Full test suite (557 unit tests) shows no regressions
- TypeScript compiles cleanly (0 errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Share SignalHoister across inline/hoist body transforms** - `e42c503` (feat)
2. **Task 2: Verify convergence gains and run full test suite** - verification only, no code changes

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Added SignalHoister import, shared hoister creation, pass-through to transformSCallBody, deduplication after body transforms
- `src/optimizer/jsx-transform.ts` - Added optional `sharedSignalHoister` parameter to transformAllJsx, use shared instance when provided

## Decisions Made
- Shared SignalHoister passed through transformSCallBody to transformAllJsx for _hf counter continuity across multiple body transforms
- Reverted _captures import suppression for inline strategy -- inline .s() bodies legitimately use `_captures` for non-event-handler captures (evidenced by `example_inlined_entry_strategy` snapshot)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted _captures import suppression**
- **Found during:** Task 1 verification
- **Issue:** Plan assumed _captures should not be imported for inline strategy, but `example_inlined_entry_strategy` snapshot shows _captures IS needed -- inline .s() bodies use `_captures[N]` for non-event-handler captures. The `.w()` delivery only applies to event handlers.
- **Fix:** Reverted both _captures suppression changes (the `!isInline` guard and the `sym === '_captures' && isInline` filter) to restore correct behavior.
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** e42c503 (included in Task 1 commit)

## Issues Encountered
- Convergence pass count stayed at 73 (no improvement from shared hoister alone) because the inline/hoist tests that fail have other root causes beyond _hf duplication (body codegen, capture classification, JSX transform differences)

## Remaining Root Causes for Inline/Hoist Failures
Based on Task 2 analysis of still-failing tests:
- **Body codegen differences:** `.s()` body text generation differs from SWC in capture injection, nested QRL rewriting, and JSX transform ordering
- **Capture classification:** Some tests expect different capture delivery patterns (`.w()` vs `_captures`)
- **JSX prop classification:** var/const classification in body JSX transforms may differ
- **_qrlSync serialization:** Several tests involve sync QRL patterns not yet converged
- These are documented for future phases (Phase 18+)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared SignalHoister infrastructure is in place for correct _hf deduplication
- Remaining inline/hoist convergence requires deeper body codegen fixes (future phases)
- 73/210 convergence maintained as baseline

---
*Phase: 17-inline-hoist-strategy-convergence*
*Completed: 2026-04-11*
