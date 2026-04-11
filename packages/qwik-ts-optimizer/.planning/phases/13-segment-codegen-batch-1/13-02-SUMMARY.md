---
phase: 13-segment-codegen-batch-1
plan: 02
subsystem: optimizer
tags: [segment-codegen, imports, post-transform, jsx-refs, namespace-imports, import-assertions]

requires:
  - phase: 13-segment-codegen-batch-1
    provides: "Segment body transforms (rawProps, sync$, TS stripping, dead code)"
provides:
  - "Post-transform import re-collection for segment modules"
  - "SegmentImportContext interface for passing parent module import data"
  - "collectBodyIdentifiers() AST-based identifier scanner"
  - "Same-file component ref imports, namespace imports, import attribute preservation"
affects: [13-03, segment-codegen]

tech-stack:
  added: []
  patterns: ["oxc-parser + oxc-walker for post-transform body identifier scanning", "import attribute preservation from AST"]

key-files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "collectBodyIdentifiers uses full AST parse via oxc-parser/oxc-walker with regex fallback"
  - "Import re-collection runs after ALL body transforms but before final export statement"
  - "sameFileExportNames includes both exported AND top-level declared names for self-referential imports"
  - "Import attributes collected from AST ImportDeclaration.attributes or .assertions fields"

patterns-established:
  - "Post-transform import re-collection: parse final body, match identifiers against parent module imports and same-file exports"

requirements-completed: []

duration: 3min
completed: 2026-04-11
---

# Phase 13 Plan 02: Segment Import Re-collection Summary

**Post-transform import re-collection scanning segment bodies for same-file component refs, namespace imports, import assertions, _auto_ migration, and Qrl-suffixed runtime imports -- 1 new convergence test passing (44 -> 45)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T12:28:10Z
- **Completed:** 2026-04-11T12:31:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added SegmentImportContext interface and collectBodyIdentifiers() AST scanner to segment-codegen.ts
- Added post-transform import re-collection step that runs after all body transforms (JSX, nested calls, sync$, captures, signature rewrite)
- Wired import context from transform.ts collecting sameFileExportNames, import attributes, and module imports
- 1 additional convergence test now passing (44 -> 45 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add post-transform import re-collection to segment-codegen.ts** - `ba95ad2` (feat)
2. **Task 2: Wire import context from transform.ts to generateSegmentCode** - `10c9e79` (feat)

## Files Created/Modified
- `src/optimizer/segment-codegen.ts` - Added SegmentImportContext interface, collectBodyIdentifiers() helper, post-transform import re-collection step with Qrl-suffix detection
- `src/optimizer/transform.ts` - Imported SegmentImportContext, collected sameFileExportNames from AST, collected import attributes, built moduleImports array, passed importContext to generateSegmentCode

## Decisions Made
- collectBodyIdentifiers uses full AST parse (oxc-parser + oxc-walker walk) with regex fallback for robustness
- Import re-collection placed after signature rewrite but before final export -- ensures all body transforms are visible
- sameFileExportNames includes top-level declarations (not just exports) to catch component references
- Import attributes collected from both `node.attributes` and `node.assertions` for AST compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Post-transform import re-collection pipeline complete
- 45 convergence tests passing as new baseline
- Ready for 13-03 plan to address remaining segment codegen issues

## Self-Check: PASSED

---
*Phase: 13-segment-codegen-batch-1*
*Completed: 2026-04-11*
