---
phase: 18-capture-classification-convergence
plan: 02
subsystem: optimizer
tags: [capture-classification, explicit-captures, inlinedQrl, import-filtering, q:ps-sort]

requires:
  - phase: 18-capture-classification-convergence
    provides: Alphabetical non-loop capture sorting, q:ps injection for event handlers
provides:
  - Import filtering for captured variables in segment codegen
  - Explicit capture metadata population for inlinedQrl extractions
  - Alphabetical sort for non-loop slot unification and elementQpParams
  - skipCaptureInjection flag for inlinedQrl segment bodies
affects: [capture-delivery, segment-codegen, convergence-gate]

tech-stack:
  added: []
  patterns:
    - "Captured variables filtered from segment imports (delivered via _captures, not imported)"
    - "inlinedQrl explicit captures parsed to populate captureNames metadata"
    - "skipCaptureInjection flag separates import filtering from _captures unpacking injection"
    - "Non-loop handlers: alphabetical sort in both slot unification and elementQpParams"

key-files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/segment-codegen.ts

key-decisions:
  - "Explicit captures from inlinedQrl array args populate captureNames with identifiers only (literals excluded)"
  - "skipCaptureInjection flag allows captureNames to be used for import filtering without injecting _captures unpacking"
  - "extractionLoopMap hoisted to outer scope for access from slot unification and elementQpParams blocks"

patterns-established:
  - "Import filtering: captured variables are never imported in segments -- delivered via _captures mechanism"
  - "skipCaptureInjection pattern for inlinedQrl: body already has _captures refs, but captureNames still needed for import filtering and metadata"

requirements-completed: [CAP-03]

duration: 12min
completed: 2026-04-11
---

# Phase 18 Plan 02: Capture Classification Convergence Validation Summary

**Explicit capture metadata for inlinedQrl, import filtering for captured variables, and alphabetical sort fixes for non-loop slot unification -- convergence 74/210**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-11T19:26:44Z
- **Completed:** 2026-04-11T19:38:44Z
- **Tasks:** 1 of 1
- **Files modified:** 2

## Accomplishments

### Task 1: Diagnose and fix remaining capture metadata mismatches

1. **Explicit capture metadata for inlinedQrl** (transform.ts): Extractions with `explicitCaptures` (e.g., `inlinedQrl(() => ..., 'name', [left, true, right])`) now parse the capture array to populate `captureNames` with identifier names only (excluding literals like `true`, `false`, `null`). This fixes metadata for tests like `should_preserve_non_ident_explicit_captures`.

2. **Import filtering for captured variables** (segment-codegen.ts): Variables in `captureNames` are now filtered out of segment imports at two points: the initial segmentImports loop and the post-transform import re-collection. Captured variables are delivered via `_captures`, not imported.

3. **skipCaptureInjection flag** (segment-codegen.ts): For inlinedQrl segments where the body already contains `_captures` references, a new `skipCaptureInjection` flag prevents double injection of `_captures` unpacking while still allowing captureNames to be used for import filtering and `_captures` import deduplication.

4. **Alphabetical sort for non-loop slot unification** (transform.ts): Both the slot unification (2a-slots) and elementQpParams building now check `extractionLoopMap` to determine if handlers are in a loop. Non-loop handlers use alphabetical sort; loop handlers use declaration-position sort. This fixes `moves_captures_when_possible` handler paramNames and q:ps ordering.

5. **extractionLoopMap scope hoisting** (transform.ts): Moved `extractionLoopMap` from inner block scope to outer scope so slot unification and elementQpParams blocks can access it for loop-vs-non-loop sort decisions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose and fix remaining capture metadata mismatches** - `a105406` (fix)

## Files Created/Modified

- `src/optimizer/transform.ts` - Explicit capture parsing, extractionLoopMap scope hoisting, alphabetical sort for non-loop handlers
- `src/optimizer/segment-codegen.ts` - Import filtering for captured variables, skipCaptureInjection flag, _captures import deduplication

## Decisions Made

- Used simple regex-based parsing for explicit capture arrays rather than full AST parsing (sufficient for identifier extraction)
- skipCaptureInjection as a boolean flag on SegmentCaptureInfo interface rather than a separate code path
- extractionLoopMap hoisted to outer scope rather than passed as parameter (simpler, already in same function)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate _captures import for inlinedQrl segments**
- **Found during:** Task 1 verification
- **Issue:** inlinedQrl body references `_captures` directly, causing both segmentImports and captureInfo paths to add the import
- **Fix:** Skip _captures import injection when skipCaptureInjection is set (segmentImports already handles it)
- **Files modified:** src/optimizer/segment-codegen.ts
- **Committed in:** a105406

**2. [Rule 1 - Bug] Post-transform import re-collection ignoring captured variables**
- **Found during:** Task 1 verification
- **Issue:** The post-transform body identifier scan re-added imports for captured variables
- **Fix:** Added capturedNames check in the post-transform re-collection loop
- **Files modified:** src/optimizer/segment-codegen.ts
- **Committed in:** a105406

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct import filtering in segments with captures.

## Remaining Capture-Related Test Failures (Cross-Phase)

The following 11 capture-related tests still fail for reasons unrelated to capture classification:

| Test | Root Cause | Phase |
|------|-----------|-------|
| moves_captures_when_possible | Flags mismatch (5 vs 7, missing loop bit for children) | JSX flags (Phase 19) |
| example_multi_capture | _rawProps destructuring transform (body codegen) | Capture delivery (deferred) |
| example_capture_imports | Missing style_css segment + component body | Cross-phase |
| example_functional_component_capture_props | _rawProps single-capture handling | Capture delivery (deferred) |
| hoisted_fn_signal_in_loop | _hf ordering (fn-signal counter) | Phase 17 edge case |
| should_transform_nested_loops | Component body structure mismatch | Variable migration |
| should_transform_handler_in_for_of_loop | Flags mismatch (4 vs 6) in component body | JSX flags |
| should_transform_handlers_capturing_cross_scope_in_nested_loops | Component body structure | Variable migration |
| should_transform_three_nested_loops_handler_captures_outer_only | Component body structure | Variable migration |
| should_extract_multiple_qrls_with_item_and_index_and_capture_ref | .w() embedding in component body | Capture delivery |
| example_component_with_event_listeners_inside_loop | Multiple handler segment mismatches | Loop codegen |

## Verification

- **Convergence:** 74/210 passed (1 improvement from 73 baseline)
- **Full test suite:** 556 passed, 139 failed (30/33 test files pass)
- **TypeScript:** Zero compilation errors
- **Zero regressions:** Same 3 pre-existing test file failures

## Issues Encountered

None -- fixes applied cleanly, no unexpected interactions.

## Next Phase Readiness

- Phase 18 complete. Capture classification infrastructure is solid.
- Remaining capture-related failures are cross-phase issues (JSX flags, _rawProps, variable migration)
- Convergence at 74/210, ready for Phase 19+ work on JSX and migration issues

---
*Phase: 18-capture-classification-convergence*
*Completed: 2026-04-11*
