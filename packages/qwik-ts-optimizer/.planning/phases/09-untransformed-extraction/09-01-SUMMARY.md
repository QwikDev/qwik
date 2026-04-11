---
phase: 09-untransformed-extraction
plan: 01
subsystem: optimizer
tags: [marker-detection, import-source, qrl-import, non-qwik-packages, renamed-imports]

# Dependency graph
requires:
  - phase: 08-parent-rewrite-batch-2
    provides: parent module rewriting with import assembly
provides:
  - Broadened isMarkerCall recognizing any $-suffixed imported specifier
  - ExtractionResult.importSource field tracking original package
  - getQrlImportSource routing non-Qwik Qrl variants to original package
  - Fixed isCustomInlined to not reject imported non-Qwik markers
affects: [09-untransformed-extraction, segment-codegen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "importedName.endsWith('$') pattern for marker detection (replaces isQwikCore check)"
    - "importSource field on ExtractionResult for package-aware import assembly"

key-files:
  created: []
  modified:
    - src/optimizer/marker-detection.ts
    - src/optimizer/extract.ts
    - src/optimizer/rewrite-calls.ts
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/marker-detection.test.ts

key-decisions:
  - "isMarkerCall checks importedName.endsWith('$') instead of isQwikCore -- any $-suffixed import is a marker regardless of source package"
  - "isCustomInlined returns false when callee is found in imports (imported = not custom inlined) regardless of package source"

patterns-established:
  - "Import source propagation: ExtractionResult.importSource flows through to getQrlImportSource for correct Qrl variant import assembly"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-04-11
---

# Phase 09 Plan 01: Untransformed Extraction - Broadened Marker Detection Summary

**Broadened isMarkerCall to recognize all $-suffixed imports (non-Qwik packages, renamed imports) and fixed Qrl import source resolution for non-Qwik packages**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-11T07:13:57Z
- **Completed:** 2026-04-11T07:20:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- isMarkerCall now recognizes formAction$ from 'forms', serverAuth$ from '@auth/qwik', and renamed imports like { component$ as Component }
- ExtractionResult carries importSource field so downstream import assembly knows the original package
- getQrlImportSource routes non-Qwik Qrl variants (formActionQrl, serverAuthQrl) to their original packages instead of @qwik.dev/core
- Fixed isCustomInlined bug that incorrectly classified all non-Qwik imports as custom inlined

## Task Commits

Each task was committed atomically:

1. **Task 1: Broaden isMarkerCall and add importSource to ExtractionResult** - `d4fc356` (feat)
2. **Task 2: Fix QRL import source resolution for non-Qwik packages** - `c1d36d2` (feat)

## Files Created/Modified
- `src/optimizer/marker-detection.ts` - Broadened isMarkerCall to check importedName.endsWith('$') instead of isQwikCore
- `src/optimizer/extract.ts` - Added importSource field to ExtractionResult interface and set it during extraction
- `src/optimizer/rewrite-calls.ts` - Updated getQrlImportSource with optional originalSource parameter and isQwikPackage helper
- `src/optimizer/rewrite-parent.ts` - Fixed isCustomInlined logic; pass ext.importSource to getQrlImportSource at both call sites
- `tests/optimizer/marker-detection.test.ts` - Added 5 tests for non-Qwik packages, renamed imports, and local functions

## Decisions Made
- isMarkerCall uses importedName.endsWith('$') instead of isQwikCore check -- this single condition handles both non-Qwik packages and renamed imports
- isCustomInlined was fundamentally fixed: if a callee is found in imports, it is NOT custom inlined regardless of package source. Custom inlined means locally defined via `export const X$ = wrap(XQrl)` pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed isCustomInlined rejecting all non-Qwik imported markers**
- **Found during:** Task 2 (Fix QRL import source resolution)
- **Issue:** isCustomInlined returned `!info.isQwikCore`, treating all non-Qwik imports (formAction$ from 'forms') as custom inlined, which skipped adding their Qrl import
- **Fix:** Changed logic so imported bindings are never considered custom inlined; only callee names not found in imports are custom inlined
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Verification:** formActionQrl import from "forms" now appears in parent output
- **Committed in:** c1d36d2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- without it, no non-Qwik Qrl variant imports would be generated. No scope creep.

## Issues Encountered
- The 7 target snapshots still fail convergence tests due to pre-existing issues unrelated to marker detection: variable migration (const t = translate() not simplified), duplicate export handling, and PURE annotation format differences. These were failing before this plan's changes and are out of scope for this plan.

## Next Phase Readiness
- Marker detection and import source resolution are complete for all non-Qwik packages and renamed imports
- The 7 target snapshots are unblocked from the marker detection perspective but need additional fixes in other areas (variable migration, duplicate exports) to fully pass
- No regressions: 477 unit tests pass, 33 convergence tests pass (gained 1 from broadened detection)

---
*Phase: 09-untransformed-extraction*
*Completed: 2026-04-11*
