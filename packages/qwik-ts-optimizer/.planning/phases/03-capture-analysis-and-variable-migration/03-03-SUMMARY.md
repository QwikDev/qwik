---
phase: 03-capture-analysis-and-variable-migration
plan: 03
subsystem: optimizer
tags: [captures, migration, _auto_, _captures, codegen, pipeline]

# Dependency graph
requires:
  - phase: 03-01
    provides: analyzeCaptures, collectScopeIdentifiers, CaptureAnalysisResult
  - phase: 03-02
    provides: analyzeMigration, collectModuleLevelDecls, computeSegmentUsage, MigrationDecision
provides:
  - Full capture analysis wired into transform pipeline
  - _captures injection in segment codegen
  - _auto_ imports/exports for module-level variable migration
  - .w() wrapping on parent QRL references for captured segments
  - captureNames and paramNames in segment metadata
affects: [phase-04, phase-05, snapshot-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [scope-aware capture analysis with nested extraction support, migration-based variable routing]

key-files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts
    - src/optimizer/extract.ts
    - tests/optimizer/transform.test.ts

key-decisions:
  - "Nested captures use parent extraction's body scope (not module scope) for parentScopeIdentifiers"
  - "Top-level segments with migrated variables have those vars filtered from captureNames to prevent double-handling"
  - "ParenthesizedExpression unwrapping needed when re-parsing body text wrapped in parens"

patterns-established:
  - "Migration-aware capture filtering: migrated vars excluded from captures for top-level segments"
  - "Scope computation per extraction: each body text parsed to collect scope identifiers for child extractions"

requirements-completed: [CAPT-02, CAPT-03]

# Metrics
duration: 6min
completed: 2026-04-10
---

# Phase 03 Plan 03: Pipeline Integration Summary

**Wired capture analysis and variable migration into the optimizer pipeline with _captures injection, _auto_ imports/exports, and .w() wrapping**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-10T20:14:16Z
- **Completed:** 2026-04-10T20:20:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Segment codegen now injects `_captures` import and unpacking for scope-level captures
- Segment codegen generates `_auto_VARNAME` imports from parent module path for migrated variables
- Parent module rewrites append `.w([var1, var2])` to QRL references for captured segments
- Parent module appends `_auto_` exports and removes moved declarations
- transform.ts runs full capture + migration analysis pipeline, passing results through to codegen
- captureNames and paramNames included in segment metadata output
- 192 tests passing (3 new integration tests, 189 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update segment-codegen.ts with _captures injection, _auto_ imports, and moved declarations** - `6f8d576` (feat)
2. **Task 2: Update rewrite-parent.ts with .w() wrapping and _auto_ exports, wire transform.ts pipeline** - `66bde8e` (feat)

## Files Created/Modified
- `src/optimizer/segment-codegen.ts` - Added SegmentCaptureInfo, _captures injection, _auto_ imports, moved declarations
- `src/optimizer/rewrite-parent.ts` - Added .w() wrapping, _auto_ exports, moved declaration removal
- `src/optimizer/transform.ts` - Wired capture analysis, migration analysis, scope computation per extraction
- `src/optimizer/extract.ts` - Added captureNames/paramNames fields to ExtractionResult
- `tests/optimizer/transform.test.ts` - Added 3 integration tests for captures and migration

## Decisions Made
- Nested captures require computing scope identifiers from the parent extraction's body (not module scope), because variables like `count` inside a component$ body are not module-level declarations
- ParenthesizedExpression must be unwrapped when re-parsing body text wrapped in `(...)` for oxc-parser
- Top-level segments have migrated variable names filtered from captureNames to prevent both _captures injection AND _auto_ import for the same variable
- Variable declarations that appear in root scope (including their own `const x = ...` site) trigger reexport rather than move in migration analysis -- this is correct per the migration decision tree

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ParenthesizedExpression unwrapping for re-parsed body text**
- **Found during:** Task 2 (wiring capture analysis)
- **Issue:** oxc-parser wraps `(bodyText)` in ParenthesizedExpression, causing ArrowFunctionExpression check to fail and scope collection to return empty
- **Fix:** Added while-loop to unwrap ParenthesizedExpression before checking closure node type
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 66bde8e

**2. [Rule 1 - Bug] Nested capture scope computation used module scope instead of parent body scope**
- **Found during:** Task 2 (wiring capture analysis)
- **Issue:** All extractions used moduleScopeIds as parentScopeIdentifiers, but nested $() closures need the enclosing extraction's body scope
- **Fix:** Pre-compute bodyScopeIds per extraction, detect nesting via range containment, pass correct parent scope
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 66bde8e

**3. [Rule 1 - Bug] Migrated variables double-counted as captures for top-level segments**
- **Found during:** Task 2 (integration test for _auto_ imports)
- **Issue:** analyzeCaptures detected module-level vars as captures, but migration handles them via _auto_ imports; captures flag was incorrectly true
- **Fix:** Filter migrated var names from captureNames for top-level segments, update captures flag
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 66bde8e

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed bugs above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete: capture analysis and variable migration fully wired into the optimizer pipeline
- Ready for Phase 4 (snapshot testing against corpus) to validate end-to-end correctness
- 192 tests green, no regressions

---
*Phase: 03-capture-analysis-and-variable-migration*
*Completed: 2026-04-10*
