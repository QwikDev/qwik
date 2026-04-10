---
phase: 02-core-extraction-pipeline
plan: 01
subsystem: api
tags: [typescript, types, imports, oxc-walker, oxc-transform, magic-string]

# Dependency graph
requires:
  - phase: 01-test-infrastructure
    provides: "Hash verification, snapshot parser, test infrastructure"
provides:
  - "All API types: TransformModulesOptions, TransformOutput, TransformModule, SegmentAnalysis"
  - "Import path rewriting: rewriteImportSource() for @builder.io -> @qwik.dev"
  - "Phase 2 dependencies: oxc-walker, oxc-transform, magic-string"
affects: [02-02, 02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: [magic-string@0.30.21, oxc-walker@0.7.0, oxc-transform@0.124.0]
  patterns: [type-driven-api-design, prefix-sorted-rewrite-rules]

key-files:
  created:
    - src/optimizer/types.ts
    - src/optimizer/rewrite-imports.ts
    - tests/optimizer/types.test.ts
    - tests/optimizer/rewrite-imports.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Sort import rewrite rules by descending from-length to prevent false prefix matches"
  - "SegmentMetadataInternal extends SegmentAnalysis with optional paramNames/captureNames for snapshot compat"

patterns-established:
  - "Types-first: define API contract types before implementation"
  - "Prefix-sorted rewrite rules: longer prefixes match first to avoid ambiguity"

requirements-completed: [EXTRACT-07, API-03, IMP-01, IMP-02, IMP-03]

# Metrics
duration: 3min
completed: 2026-04-10
---

# Phase 02 Plan 01: Types and Import Rewriting Summary

**API types matching NAPI interface plus @builder.io -> @qwik.dev import rewriting with 11 tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T18:52:00Z
- **Completed:** 2026-04-10T18:54:33Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- All API types defined matching the NAPI binding interface (TransformModulesOptions, TransformOutput, TransformModule, SegmentAnalysis, EntryStrategy with 7 variants, MinifyMode, EmitMode, Diagnostic)
- SegmentMetadataInternal type for snapshot comparison compatibility with paramNames/captureNames
- Import path rewriting handling all 3 @builder.io packages with sub-path preservation
- Phase 2 dependencies installed (magic-string, oxc-walker, oxc-transform)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and define API types** - `bf4f82f` (feat)
2. **Task 2: Import path rewriting module** - `8cd1b56` (test: RED), `36cab18` (feat: GREEN)

## Files Created/Modified
- `src/optimizer/types.ts` - All API types for the optimizer public interface
- `src/optimizer/rewrite-imports.ts` - Import source path rewriting (@builder.io -> @qwik.dev)
- `tests/optimizer/types.test.ts` - 7 type verification tests
- `tests/optimizer/rewrite-imports.test.ts` - 11 import rewriting tests
- `package.json` - Added magic-string, oxc-walker, oxc-transform dependencies
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Sorted IMPORT_REWRITES by descending from-length so @builder.io/qwik-city matches before @builder.io/qwik
- Added SegmentMetadataInternal as separate type extending SegmentAnalysis rather than adding optional fields directly to SegmentAnalysis (keeps public API clean)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types are ready for use by all subsequent plans in Phase 02
- rewriteImportSource() ready for integration in the transform pipeline (Plan 02-02+)
- oxc-walker, oxc-transform, magic-string all installed and available

---
*Phase: 02-core-extraction-pipeline*
*Completed: 2026-04-10*

## Self-Check: PASSED

All 4 created files verified on disk. All 3 commits verified in git log.
