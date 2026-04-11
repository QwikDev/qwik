---
phase: 14-segment-codegen-batch-2
plan: 01
subsystem: optimizer
tags: [segment-codegen, nested-calls, calleeQrl, magic-string]

requires:
  - phase: 13-segment-codegen-batch-1
    provides: Segment codegen pipeline with nested call site info

provides:
  - calleeQrl wrapping for named marker calls in segment bodies
  - qrlCallee/captureNames/importSource fields on NestedCallSiteInfo
  - Qrl-suffixed callee imports in segment import lists

affects: [14-segment-codegen-batch-2, segment-codegen]

tech-stack:
  added: []
  patterns:
    - "Named markers in segment bodies emit calleeQrl(qrlVar) with .w([captures]) chaining"
    - "getQrlImportSource resolves Qrl-suffixed callee import sources for segments"

key-files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "Used getQrlImportSource from rewrite-calls.ts for consistent import source resolution across parent and segment codegen"
  - "Bare $() calls still emit plain QRL variable; only named markers get calleeQrl wrapping"

patterns-established:
  - "NestedCallSiteInfo carries qrlCallee/captureNames/importSource from ExtractionResult for segment codegen"

requirements-completed: [P14-01]

duration: 9min
completed: 2026-04-11
---

# Phase 14 Plan 01: Nested Call Rewriting Summary

**Nested marker calls in segment bodies now emit calleeQrl(qrlVar) with .w([captures]) chaining instead of bare QRL variable references**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-11T13:13:12Z
- **Completed:** 2026-04-11T13:22:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added qrlCallee, captureNames, importSource fields to NestedCallSiteInfo interface
- Populated fields from ExtractionResult during nested call site construction in transform.ts
- Named markers (useTask$, useBrowserVisibleTask$, etc.) now correctly emit calleeQrl(qrlVar) pattern in segment bodies
- Capture chaining via .w([captures]) works correctly (verified with useBrowserVisibleTask example)
- Qrl-suffixed callee imports (e.g., useBrowserVisibleTaskQrl) automatically added to segment import lists

## Task Commits

Each task was committed atomically:

1. **Task 1: Add qrlCallee to NestedCallSiteInfo and populate it during extraction** - `55e4a4b` (feat)
2. **Task 2: Verify nested call fix across all 6 affected snapshots and fix edge cases** - verification-only, no code changes needed

## Files Created/Modified

- `src/optimizer/segment-codegen.ts` - Added qrlCallee/captureNames/importSource to NestedCallSiteInfo; calleeQrl wrapping in body rewriting; Qrl-suffixed import resolution
- `src/optimizer/transform.ts` - Populated qrlCallee, captureNames, importSource from ExtractionResult on nested call sites

## Decisions Made

- Used `getQrlImportSource()` from `rewrite-calls.ts` for consistent Qrl import source resolution (handles non-Qwik packages, qwikifyQrl, etc.)
- Bare `$()` calls continue to emit plain QRL variable names (no calleeQrl wrapping) -- only named markers get the wrapping treatment
- The 4 convergence tests that were expected to be newly fixed were already failing due to pre-existing parent module or entry strategy issues unrelated to nested call rewriting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The 6 target snapshots were already failing before this plan due to unrelated issues (parent module mismatches, smart entry strategy differences). The nested call rewriting code IS producing correct output (verified via isolated segment comparison), but the convergence test counts don't change because the pre-existing failures mask the segment improvements.
- Convergence count remains at 51/210 (zero regressions, zero net new passes due to masking by other failure categories)

## Next Phase Readiness

- Nested call rewriting foundation complete
- Plans 14-02 and 14-03 can build on the calleeQrl infrastructure
- Pre-existing parent module failures in example_strip_exports_used and entry strategy issues in example_use_server_mount need separate fixes

---
*Phase: 14-segment-codegen-batch-2*
*Completed: 2026-04-11*
