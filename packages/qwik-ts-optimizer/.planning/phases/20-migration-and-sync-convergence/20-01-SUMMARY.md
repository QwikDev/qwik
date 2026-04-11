---
phase: 20-migration-and-sync-convergence
plan: 01
subsystem: optimizer
tags: [variable-migration, scope-analysis, ast-walking, segment-codegen]

requires:
  - phase: 19-jsx-prop-classification
    provides: JSX transform and prop classification infrastructure
provides:
  - Scope-aware computeSegmentUsage filtering local declarations from segment usage
  - Declaration-site filtering from rootUsage matching SWC build_main_module_usage_set
  - Moved declarations carry import dependencies into segments
  - Parent .w() capture suppression for moved variables
affects: [20-02, capture-analysis, convergence]

tech-stack:
  added: []
  patterns: [collectLocalDeclarations for scope-aware filtering, import dep tracking for moved declarations]

key-files:
  created: []
  modified:
    - src/optimizer/variable-migration.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/variable-migration.test.ts
    - tests/optimizer/transform.test.ts

key-decisions:
  - "Declaration-site identifiers at root level excluded from rootUsage (matching SWC build_main_module_usage_set)"
  - "Moved variables suppressed from parent .w() captures (not just reexported ones)"
  - "Import re-collection skips variables with move migration decision"

patterns-established:
  - "collectLocalDeclarations: walk AST range collecting params, variable declarations, catch params for scope-aware filtering"
  - "collectRootDeclPositions: position-based filtering of declaration-site identifiers at module root"

requirements-completed: [MIGR-01, MIGR-02, MIGR-03]

duration: 11min
completed: 2026-04-11
---

# Phase 20 Plan 01: Variable Migration Scope-Aware Filtering Summary

**Scope-aware variable migration with local declaration filtering, import dependency tracking for moved declarations, and parent capture suppression**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-11T21:31:41Z
- **Completed:** 2026-04-11T21:43:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Single-segment-exclusive variables now correctly classified as "move" instead of "reexport" by filtering declaration-site identifiers from rootUsage
- Locally-declared identifiers within extraction ranges (params, local vars, catch params) filtered from segment usage
- Moved declarations carry their import dependencies into segment modules
- Parent module no longer generates spurious .w() capture wrapping for moved variables
- Convergence: 76/210 (up from 75, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix computeSegmentUsage to filter declaration-site and locally-shadowed identifiers** - `7e65076` (feat)
2. **Task 2: Ensure moved declarations carry import dependencies into segments** - `8489e8e` (feat)

## Files Created/Modified
- `src/optimizer/variable-migration.ts` - Added collectLocalDeclarations, collectRootDeclPositions, collectBindingPositions helpers; updated computeSegmentUsage to filter local and declaration-site identifiers
- `src/optimizer/segment-codegen.ts` - Changed movedDeclarations type to include importDeps; emit import deps before moved declarations; skip import generation for moved variables
- `src/optimizer/transform.ts` - Compute import dependencies for moved declarations by walking their AST range against originalImports
- `src/optimizer/rewrite-parent.ts` - Fixed migratedNames to include both 'reexport' and 'move' actions for .w() capture suppression
- `tests/optimizer/variable-migration.test.ts` - Updated test to expect declaration-site x NOT in rootUsage (matching SWC behavior)
- `tests/optimizer/transform.test.ts` - Updated migration tests to expect 'move' behavior instead of 'reexport' for single-segment-exclusive variables

## Decisions Made
- Declaration-site identifiers at root level are excluded from rootUsage, matching SWC's `build_main_module_usage_set` which explicitly skips `Stmt::Decl` items
- Both 'move' and 'reexport' migration decisions suppress .w() capture wrapping in parent -- previously only 'reexport' was suppressed, causing spurious captures for moved variables
- Post-transform import re-collection in segment codegen skips variables with 'move' migration decision since they are physically present as moved declarations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parent .w() captures not suppressed for moved variables**
- **Found during:** Task 2
- **Issue:** `rewrite-parent.ts` migratedNames set only included 'reexport' actions, not 'move' actions, causing parent to generate `.w([helperFn])` for moved variables
- **Fix:** Added `d.action === 'move'` to the migratedNames filter
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Committed in:** 8489e8e (Task 2 commit)

**2. [Rule 1 - Bug] Spurious import generated for moved variables in segment codegen**
- **Found during:** Task 2
- **Issue:** Post-transform import re-collection found moved variable names in the body and generated imports from parent module, creating duplicate definitions
- **Fix:** Added check to skip same-file import generation when migration decision is 'move'
- **Files modified:** src/optimizer/segment-codegen.ts
- **Committed in:** 8489e8e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correct migration behavior. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Variable migration decisions now match SWC behavioral rules for move vs reexport
- Shadowed variables properly filtered from segment usage
- Moved declarations include import dependencies
- Ready for Phase 20 Plan 02 (sync convergence)

---
*Phase: 20-migration-and-sync-convergence*
*Completed: 2026-04-11*
