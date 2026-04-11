---
phase: 17-inline-hoist-strategy-convergence
plan: 01
subsystem: optimizer
tags: [import-ordering, synthetic-imports, magic-string, convergence]

# Dependency graph
requires:
  - phase: 07-12 (v2.0)
    provides: rewrite-parent.ts with neededImports Map and synthetic import assembly
provides:
  - Import ordering fix -- Map insertion order (discovery order) instead of alphabetical sort
affects: [17-02, inline-hoist snapshots, convergence tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [Map insertion order for SWC-compatible import sequencing]

key-files:
  created: []
  modified: [src/optimizer/rewrite-parent.ts]

key-decisions:
  - "Use Map insertion order for synthetic imports to match SWC Vec insertion ordering"

patterns-established:
  - "Import ordering: Map insertion order (discovery order), not alphabetical -- matches SWC behavior"

requirements-completed: [IHS-01, IHS-02, IHS-03]

# Metrics
duration: 1min
completed: 2026-04-11
---

# Phase 17 Plan 01: Import Ordering Fix Summary

**Synthetic import ordering changed from alphabetical sort to Map insertion order, matching SWC's Vec discovery ordering -- zero regressions in 73 convergence tests**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-11T18:26:26Z
- **Completed:** 2026-04-11T18:27:10Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed `.sort((a, b) => a[0].localeCompare(b[0]))` from synthetic import assembly
- Import order now uses JavaScript Map insertion order, which matches SWC's Rust Vec insertion ordering
- All 73 previously-passing convergence tests maintained (zero regressions)
- Full test suite (557 unit + 73 convergence passing) shows no new regressions
- TypeScript compiles cleanly (0 errors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove alphabetical import sort and use Map insertion order** - `8f09ba4` (fix)
2. **Task 2: Run full test suite to verify no unit test regressions** - verification only, no code changes

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Changed import ordering from alphabetical to Map insertion order (discovery order)

## Decisions Made
- Used Map insertion order for synthetic imports to match SWC's Vec insertion ordering -- JavaScript Map guarantees insertion order, same as Rust Vec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import ordering fix is the widest-blast-radius root cause addressed
- Ready for 17-02 (next inline/hoist convergence plan)
- Remaining 137 convergence failures have other root causes (body codegen, capture classification, etc.)

---
*Phase: 17-inline-hoist-strategy-convergence*
*Completed: 2026-04-11*
