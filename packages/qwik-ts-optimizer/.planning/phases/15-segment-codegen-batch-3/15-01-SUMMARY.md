---
phase: 15-segment-codegen-batch-3
plan: 01
subsystem: optimizer
tags: [jsx-transform, bind-desugaring, qrl-imports, variable-migration, convergence]

# Dependency graph
requires:
  - phase: 14-segment-codegen-batch-2
    provides: segment codegen pipeline, variable migration, _auto_ re-export mechanism
provides:
  - bind spread pre-scan in JSX processProps
  - router-specific QRL import source mapping
  - _auto_ re-export suppression for already-exported variables
  - snapshot-options corrections for transpileJsx
affects: [15-02, 15-03, segment-codegen, convergence-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-scan attribute arrays before processing to avoid order-dependent bugs"
    - "Already-exported variables skip _auto_ prefix in both parent re-export and segment import"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/rewrite-calls.ts
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/snapshot-options.ts

key-decisions:
  - "Unconditional segment JSX transpilation deferred -- Rust optimizer respects transpileJsx option for segments too; only specific tests need transpileJsx: true"
  - "Snapshot options corrected for ternary_prop and transform_qrl_in_regular_prop to set transpileJsx: true"
  - "Router QRL callees (globalActionQrl, routeActionQrl, routeLoaderQrl, serverQrl, zodQrl) imported from @qwik.dev/router"

patterns-established:
  - "Pre-scan hasSpreadAttr: always scan full attribute list before bind gate decisions"
  - "Already-exported variable _auto_ suppression: check isExported on moduleLevelDecls before emitting _auto_ re-export"

requirements-completed: [P15-01, P15-02, P15-04]

# Metrics
duration: 10min
completed: 2026-04-11
---

# Phase 15 Plan 01: Segment Codegen Batch 3 - Quick Fixes Summary

**Bind spread pre-scan, router QRL import mapping, and _auto_ suppression for already-exported variables -- 59 convergence tests passing (up from 55)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-11T14:25:13Z
- **Completed:** 2026-04-11T14:35:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Pre-scan JSX attributes for spreads so bind gate works regardless of attribute order in processProps
- Added router-specific QRL import source mapping for globalActionQrl, routeActionQrl, routeLoaderQrl, serverQrl, zodQrl
- Suppressed spurious _auto_ re-exports for variables that already have export declarations
- 4 new convergence tests passing: should_work, should_not_inline_exported_var_into_segment, should_disable_qwik_transform_error_by_code, example_strip_exports_used

## Task Commits

Each task was committed atomically:

1. **Task 1: Bind spread gate, router QRL source, snapshot JSX options** - `7d72e7e` (feat)
2. **Task 2: Suppress _auto_ re-export for already-exported variables** - `99d55a4` (fix)

## Files Created/Modified
- `src/optimizer/jsx-transform.ts` - Pre-scan hasSpreadAttr for bind gate; bind props in spread contexts pass through un-desugared
- `src/optimizer/rewrite-calls.ts` - Router-specific QRL callee set for @qwik.dev/router imports
- `src/optimizer/rewrite-parent.ts` - Skip _auto_ re-export when variable already has export keyword
- `tests/optimizer/snapshot-options.ts` - Corrected transpileJsx: true for ternary_prop and transform_qrl_in_regular_prop

## Decisions Made
- **Unconditional segment JSX abandoned:** The plan assumed Rust optimizer always transpiles JSX in segments regardless of transpileJsx option. Testing revealed this is false -- example_1 and many other snapshots expect raw JSX in segments when transpileJsx: false. Instead, corrected snapshot-options for the 2 specific tests that need transpileJsx: true.
- **Router QRL set:** Added 5 router-specific QRL callees based on Qwik router package exports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted unconditional segment JSX transpilation**
- **Found during:** Task 1 (Unconditional segment JSX)
- **Issue:** Plan specified removing shouldTranspileJsx gate for segments. This caused 13 regressions because most Rust snapshots expect raw JSX in segments when transpileJsx: false.
- **Fix:** Reverted transform.ts change; instead corrected snapshot-options.ts to set transpileJsx: true for the 2 affected tests (ternary_prop, transform_qrl_in_regular_prop)
- **Files modified:** src/optimizer/transform.ts (reverted), tests/optimizer/snapshot-options.ts
- **Verification:** Zero regressions from 55 baseline
- **Committed in:** 7d72e7e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Corrected faulty assumption from research. No scope creep.

## Issues Encountered
- Research assumption A2 ("Segments should always get JSX transpiled regardless of transpileJsx option") was incorrect. The Rust optimizer respects transpileJsx for segments too. Only 2 specific test snapshots need transpileJsx: true.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bind spread gate and router QRL source ready for Plan 02/03 work
- _auto_ suppression eliminates spurious re-exports that were blocking several snapshots
- ternary_prop and transform_qrl_in_regular_prop still have other segment codegen issues (body rewriting, flags) to address in Plan 02

---
*Phase: 15-segment-codegen-batch-3*
*Completed: 2026-04-11*
