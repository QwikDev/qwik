---
phase: 02-core-extraction-pipeline
plan: 02
subsystem: optimizer
tags: [ast, context-stack, marker-detection, qwik, extraction]

requires:
  - phase: 01-test-infrastructure
    provides: "naming utilities (buildDisplayName, buildSymbolName, escapeSym, qwikHash)"
provides:
  - "ContextStack class for tracking naming hierarchy during AST traversal"
  - "Marker detection functions (collectImports, isMarkerCall, isBare$, collectCustomInlined, isSyncMarker, getCtxKind, getCtxName)"
affects: [02-03-extract, 02-04-segment-emit, 02-05-parent-rewrite]

tech-stack:
  added: []
  patterns: [context-stack-push-pop, marker-detection-from-imports]

key-files:
  created:
    - src/optimizer/context-stack.ts
    - src/optimizer/marker-detection.ts
    - tests/optimizer/context-stack.test.ts
    - tests/optimizer/marker-detection.test.ts
  modified: []

key-decisions:
  - "ContextStack is a passive data structure (push/pop) not an AST walker; walker integration deferred to Plan 03"
  - "Marker detection uses both qwik core import map and custom inlined map for full coverage"

patterns-established:
  - "Pattern: ContextStack.pushDefaultExport() handles bracket-style route name extraction"
  - "Pattern: isMarkerCall checks imports map then customInlined map for $-suffixed callees"

requirements-completed: [EXTRACT-01]

duration: 3min
completed: 2026-04-10
---

# Phase 02 Plan 02: Context Stack and Marker Detection Summary

**ContextStack for segment naming hierarchy and marker function detection from AST import analysis**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T18:56:17Z
- **Completed:** 2026-04-10T18:59:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ContextStack tracks naming hierarchy (push/pop) and integrates with Phase 1 buildDisplayName/buildSymbolName for segment naming
- Default export stem extraction handles bracket-style routes ([[...slug]].tsx -> "slug", [id].tsx -> "id")
- Marker detection identifies qwik core imports, custom inlined functions ($-suffixed with Qrl variant), bare $() calls, and sync$ special case
- Full ctxKind/ctxName determination for segment metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Context stack for segment naming** - `239ecaf` (test: RED), `d1b30b6` (feat: GREEN)
2. **Task 2: Marker function detection** - `ddc2796` (test: RED), `cf769e6` (feat: GREEN)

_TDD: each task has separate test and implementation commits_

## Files Created/Modified
- `src/optimizer/context-stack.ts` - ContextStack class with push/pop, getDisplayName, getSymbolName, pushDefaultExport
- `src/optimizer/marker-detection.ts` - collectImports, collectCustomInlined, isMarkerCall, isBare$, isSyncMarker, getCtxKind, getCtxName
- `tests/optimizer/context-stack.test.ts` - 8 tests for context stack behavior
- `tests/optimizer/marker-detection.test.ts` - 11 tests for marker detection behavior

## Decisions Made
- ContextStack is a passive data structure, not an AST walker -- the walker (Plan 03) will call push/pop
- Marker detection uses two-map approach: qwik core imports map + custom inlined map for full coverage
- oxc-parser API uses positional args (filename, source) not options object -- fixed in test helper

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed oxc-parser parseSync API call in tests**
- **Found during:** Task 2 (marker detection tests)
- **Issue:** Test helper used `parseSync(code, { sourceFilename, sourceType })` but oxc-parser v0.124.0 expects `parseSync(filename, code)`
- **Fix:** Changed to positional argument API matching existing project usage in src/testing/ast-compare.ts
- **Files modified:** tests/optimizer/marker-detection.test.ts
- **Verification:** All 11 tests pass
- **Committed in:** cf769e6 (part of Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor test helper fix, no scope creep.

## Issues Encountered
None beyond the oxc-parser API deviation noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Context stack and marker detection ready for extraction engine (Plan 03)
- Plan 03 will use ContextStack push/pop during AST walk and isMarkerCall to identify extraction points
- All 19 tests pass, TypeScript compiles clean

---
*Phase: 02-core-extraction-pipeline*
*Completed: 2026-04-10*

## Self-Check: PASSED
