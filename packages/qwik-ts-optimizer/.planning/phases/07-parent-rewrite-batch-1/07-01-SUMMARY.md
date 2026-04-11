---
phase: 07-parent-rewrite-batch-1
plan: 01
subsystem: optimizer
tags: [magic-string, import-assembly, parent-rewrite, qwik-optimizer]

# Dependency graph
requires:
  - phase: 06-diagnostics-and-convergence
    provides: Parent rewriting foundation, convergence test infrastructure
provides:
  - Unified import block assembly with optimizer imports first, then surviving user imports
  - Import declarations removed from body and reassembled in preamble
affects: [07-02, parent-rewrite-batch-2, segment-codegen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Import preamble assembly: remove imports from body, track surviving user imports, reassemble in preamble"
    - "Quote style preservation via node.source.raw detection"

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts

key-decisions:
  - "Keep removeUnusedImports unchanged -- Qwik import preservation causes regressions because Rust optimizer behavior varies across snapshots"
  - "Side-effect imports kept in original body position, not moved to preamble"
  - "Quote style detected from node.source.raw to preserve single vs double quotes"

patterns-established:
  - "survivingUserImports array pattern for tracking user imports through preamble assembly"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-04-11
---

# Phase 07 Plan 01: Import Assembly Ordering Summary

**Unified import block assembly in rewrite-parent.ts with optimizer imports first, surviving user imports second, matching Rust optimizer output ordering**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-11T02:53:27Z
- **Completed:** 2026-04-11T03:04:27Z
- **Tasks:** 1 of 2 (Task 2 reverted due to regressions)
- **Files modified:** 1

## Accomplishments
- Import declarations removed from body and reassembled in preamble with correct ordering
- Optimizer-added imports appear first, then surviving user imports (with markers removed), then `//` separator
- Original quote style preserved (single vs double quotes detected from source AST)
- 11 previously-passing convergence tests remain green, zero unit test regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Unify import assembly in rewrite-parent.ts** - `1058c8d` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Steps 1+2 refactored to remove imports from body and track surviving user imports; Step 6 updated to include surviving user imports in preamble

## Decisions Made
- **removeUnusedImports left unchanged:** Task 2's planned change (preserve all Qwik imports) caused regressions in 6 tests because the Rust optimizer behavior for Qwik import preservation varies across snapshots. Some snapshots (example_functional_component) keep ALL original specifiers including markers; others (example_1, example_6, example_skip_transform) remove unreferenced specifiers regardless of Qwik origin. The correct behavior requires per-snapshot analysis beyond this plan's scope.
- **Side-effect imports preserved in place:** `import 'module'` statements (no specifiers) are not moved to the preamble, matching Rust behavior.

## Deviations from Plan

### Task 2: removeUnusedImports change reverted

**[Rule 4 - Architectural] Qwik import preservation in removeUnusedImports requires deeper analysis**
- **Found during:** Task 2 implementation
- **Issue:** The plan assumed all remaining Qwik imports after marker removal are "intentional user imports" that should be preserved. In practice, the Rust optimizer behavior varies: some snapshots keep all original Qwik specifiers (example_functional_component), while others remove unreferenced ones (example_1, example_6). Three different approaches were attempted (preserve all Qwik, preserve non-marker only, preserve non-`$` only) -- all caused regressions in different previously-passing tests.
- **Decision:** Leave removeUnusedImports unchanged. The current behavior correctly handles all 11 passing tests. The functional_component snapshot's import preservation is a separate behavior that needs to be analyzed alongside other snapshot differences in a future plan.
- **Impact:** Task 2 acceptance criteria for QWIK_IMPORT_PREFIXES usage count (>= 2) is not met. The functional_component snapshot still fails on its import section. This does not affect the 11 previously-passing tests.

---

**Total deviations:** 1 (Task 2 reverted, requires deeper architectural analysis)
**Impact on plan:** Task 1 completed successfully. Task 2 deferred to avoid regressions. Import ordering is fixed; import preservation needs per-snapshot behavioral analysis.

## Issues Encountered
- Rust optimizer import preservation behavior is inconsistent across snapshots, making a blanket "preserve Qwik imports" rule impossible without deeper analysis of per-snapshot options and Rust code paths.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import ordering in preamble is correct for all currently-passing tests
- Task 2 (Qwik import preservation) should be reconsidered in a future plan with per-snapshot option analysis
- Ready for 07-02 plan work

---
*Phase: 07-parent-rewrite-batch-1*
*Completed: 2026-04-11*
