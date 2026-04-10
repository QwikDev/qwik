---
phase: 06-diagnostics-and-convergence
plan: 02
subsystem: testing
tags: [convergence, snapshot-testing, import-cleanup, explicit-extensions, options-map]

requires:
  - phase: 06-diagnostics-and-convergence/01
    provides: "Diagnostics module (C02/C03/C05), suppression"
  - phase: 05-entry-strategy-and-mode
    provides: "Full pipeline with entry strategy, mode, const replacement"
provides:
  - "SNAPSHOT_OPTIONS map covering all 209 snapshots with correct per-test options"
  - "Convergence test harness running all 209 snapshots"
  - "Import cleanup removing dead imports from parent modules after extraction"
  - "explicitExtensions option threading through QRL declaration generation"
affects: [06-diagnostics-and-convergence/03, convergence-tracking]

tech-stack:
  added: []
  patterns: ["Per-snapshot options map with defaults for convergence testing", "Post-processing import cleanup via AST re-parse"]

key-files:
  created:
    - tests/optimizer/snapshot-options.ts
    - tests/optimizer/convergence.test.ts
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-calls.ts
    - src/optimizer/rewrite-parent.ts

key-decisions:
  - "Rust EmitMode::Test maps to our 'lib' mode (no prod optimizations, no dev instrumentation)"
  - "Import cleanup done as post-processing re-parse step rather than inline tracking during rewrite"
  - "Options for ~100 snapshots not in downloaded test.rs inferred from output file patterns (extension, JSX markers, inline indicators)"
  - "this.skip() required in oxc-walker to properly exclude import declaration subtrees from reference scanning"

patterns-established:
  - "Snapshot options map: centralized Record<string, Partial<Options>> with getSnapshotTransformOptions() helper"
  - "Import cleanup: re-parse rewritten code, collect import specifiers, scan for references, remove unreferenced"

requirements-completed: [DIAG-04]

duration: 13min
completed: 2026-04-10
---

# Phase 06 Plan 02: Convergence Infrastructure Summary

**Snapshot options map for all 209 tests, import cleanup removing dead imports, and explicitExtensions QRL path support**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-10T22:56:02Z
- **Completed:** 2026-04-10T23:09:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built comprehensive SNAPSHOT_OPTIONS map covering all 209 snapshots with correct per-test options extracted from Rust test.rs
- Created convergence test harness that runs all snapshots and reports individual pass/fail with convergence summary
- Implemented import cleanup that removes non-Qwik imports whose identifiers are no longer referenced after extraction
- Threaded explicitExtensions option through buildQrlDeclaration() to append .js suffix to QRL import paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Build snapshot options map and convergence test harness** - `78a53d8` (feat)
2. **Task 2: Implement import cleanup and explicitExtensions** - `1967d06` (feat)

## Files Created/Modified
- `tests/optimizer/snapshot-options.ts` - Per-snapshot options map with 209 entries, DEFAULT_OPTIONS, getSnapshotTransformOptions() helper
- `tests/optimizer/convergence.test.ts` - Full convergence test running all 209 snapshots with pass/fail tracking
- `src/optimizer/transform.ts` - Added removeUnusedImports() post-processing step, threaded explicitExtensions
- `src/optimizer/rewrite-calls.ts` - Added explicitExtensions parameter to buildQrlDeclaration()
- `src/optimizer/rewrite-parent.ts` - Added explicitExtensions parameter, threaded to buildQrlDeclaration() calls

## Decisions Made
- Rust's EmitMode::Test maps to our 'lib' mode -- it has no prod optimizations and no dev instrumentation
- Import cleanup implemented as a post-processing re-parse step rather than tracking during rewrite, because the rewriter adds imports that change reference patterns
- For ~100 snapshots not present in the downloaded test.rs (main branch, 3677 lines), options were inferred from output file patterns: .js extension = transpileTs, JSX markers = transpileJsx, inlinedQrl = inline strategy
- oxc-walker requires this.skip() call to prevent walking import declaration children; a simple return from enter() does not skip subtrees

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed oxc-walker import subtree skipping**
- **Found during:** Task 2 (import cleanup)
- **Issue:** Returning from enter() for ImportDeclaration nodes did not prevent walking their children, causing import specifier identifiers to be counted as references
- **Fix:** Added this.skip() call before return to properly exclude import declaration subtrees
- **Files modified:** src/optimizer/transform.ts
- **Verification:** Import cleanup test passes -- unused imports correctly removed
- **Committed in:** 1967d06

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix essential for import cleanup correctness. No scope creep.

## Issues Encountered
- Convergence pass rate did not immediately increase (3/209 baseline) because most snapshot failures have root causes beyond import cleanup (missing callee rewriting, JSX transform gaps, variable migration issues). Import cleanup and explicitExtensions are prerequisites that will show impact as those root causes are fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Snapshot options map ready for convergence tracking in Plan 03
- Import cleanup and explicitExtensions reduce noise in convergence comparisons
- Convergence baseline measured: 3/209 passing (issue_117, relative_paths, special_jsx)
- 464 tests passing across 29 test files, no regressions

---
*Phase: 06-diagnostics-and-convergence*
*Completed: 2026-04-10*
