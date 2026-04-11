---
phase: 11-segment-identity-batch-2
plan: 02
subsystem: optimizer/transform
tags: [captures-metadata, paramNames-reconciliation, snapshot-options]
dependency_graph:
  requires: []
  provides: [captures-paramNames-reconciliation, strip-server-code-prod-mode]
  affects: [segment-identity, convergence-tests]
tech_stack:
  added: []
  patterns: [captures-reconciliation-heuristic]
key_files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - tests/optimizer/snapshot-options.ts
decisions:
  - Captures reconciliation checks if all captureNames appear in paramNames; if so, captures=false
  - Reconciliation placed at two points: after capture analysis (all segments) and after migration filtering (top-level segments)
  - Capture-to-param promotion (injecting captures as function params) deferred to future plan requiring loop detection
  - example_strip_server_code requires mode:'prod' for s_ prefix segment naming
metrics:
  duration: 13min
  completed: "2026-04-11T09:56:00Z"
  tasks: 2
  files: 2
---

# Phase 11 Plan 02: Captures Metadata Reconciliation and Strip Server Code Options Summary

Captures metadata reconciliation logic added at two pipeline points; example_strip_server_code options corrected with mode:'prod' for s_ prefix naming.

## What Changed

### Task 1: Captures metadata reconciliation with paramNames (116a8b0)

Added captures-to-paramNames reconciliation logic at two points in transform.ts:

1. **After capture analysis** (line ~540) -- For all segments: when `ext.captures` is true and all `captureNames` entries are present in `paramNames`, set `captures = false`. This matches the Rust optimizer's behavior where `captures = !scoped_idents.is_empty()` -- when captured variables are delivered as function parameters, `scoped_idents` is empty.

2. **After migration filtering** (line ~885) -- For top-level segments: same reconciliation applied after migration has filtered out migrated variables from captureNames. Ensures the captures flag is correct even after migration reduces the capture set.

**Note:** The reconciliation logic is structurally correct but does not yet activate for the target snapshots (lib_mode_fn_signal, should_extract_single_qrl_2, should_handle_dangerously_set_inner_html) because capture-to-param promotion (injecting captures as function parameters with `_`, `_1` padding) is not yet implemented. The Rust optimizer promotes captured variables to function parameters for event handlers, which populates `paramNames` with the captures. This promotion requires loop detection to distinguish loop iteration variables from regular captures, and is deferred to a future plan. Once promotion is wired up, the reconciliation logic will correctly set `captures = false`.

### Task 2: Snapshot options for example_strip_server_code (f379475)

Added `mode: 'prod'` to the example_strip_server_code options in snapshot-options.ts. The expected snapshot output uses `s_` prefix naming (e.g., `s_r1qAHX7Opp0`) which requires prod mode. With this fix, 6 of 8 expected segments are now found by name in the convergence test (previously 0 matched due to non-s_ naming). The 2 remaining mismatches are pre-existing issues unrelated to this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Capture-to-param promotion not yet available**
- **Found during:** Task 1
- **Issue:** The plan's detection heuristic assumes `paramNames` is already populated with promoted captures. Investigation revealed that paramNames only contains original formal parameters, not promoted captures. The Rust optimizer injects captures as function parameters for event handlers, but this promotion logic requires loop detection (to distinguish loop vars from regular captures) which isn't wired up.
- **Fix:** Implemented the reconciliation logic as specified (structurally correct), documented that it will activate once capture-to-param promotion is implemented. Did not implement promotion to avoid regressions -- a naive "promote all captures" approach caused regressions in loop-handler tests.
- **Files modified:** src/optimizer/transform.ts

## Verification Results

- Zero regressions: 447 unit tests passing (same as baseline), 177 convergence tests failing (same as baseline)
- Reconciliation logic verified via grep: `allCapturesInParams` and `Reconcile captures with paramNames` present at both locations
- `mode: 'prod'` confirmed in snapshot-options.ts for example_strip_server_code
- example_strip_server_code now matches 6/8 segment names (was 0/8 before mode:'prod')

## Self-Check: PASSED

- [x] src/optimizer/transform.ts modified with reconciliation logic (116a8b0)
- [x] tests/optimizer/snapshot-options.ts modified with mode:'prod' (f379475)
- [x] Commit 116a8b0 exists
- [x] Commit f379475 exists
- [x] No regressions in existing passing tests
