---
phase: 08-parent-rewrite-batch-2
plan: 02
subsystem: optimizer
tags: [no-extraction-passthrough, inlinedQrl-detection, hoist-to-const, inline-strategy]

requires:
  - phase: 08-parent-rewrite-batch-2
    plan: 01
    provides: "TS stripping and capture suppression"
provides:
  - "No-extraction passthrough preserving imports when no markers found"
  - "Pre-existing inlinedQrl(null,...) binding stripping"
  - "Hoist-to-const pattern for inline strategy with transpilation"
affects: [08-parent-rewrite-batch-2]

tech-stack:
  added: []
  patterns:
    - "Early passthrough in transform.ts when extractions.length === 0 and no JSX transpilation needed"
    - "inlinedQrl binding stripping in both passthrough path and Step 4a of rewrite-parent"
    - "isHoist condition extended to include inline + transpileTs + transpileJsx"

key-files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts

key-decisions:
  - "No-extraction passthrough gated on !needsJsxTransform to avoid bypassing JSX transpilation for .tsx files"
  - "Hoist-to-const pattern triggered by transpileTs && transpileJsx on inline strategy, matching Rust optimizer behavior"

patterns-established:
  - "Early exit passthrough for zero-extraction files avoids import stripping side effects"
  - "inlinedQrl calls treated as pre-processed QRL output, not markers for extraction"

requirements-completed: [SC-1, SC-2, SC-3]

duration: 13min
completed: 2026-04-11
---

# Phase 08 Plan 02: No-extraction Passthrough, inlinedQrl Detection, and Hoist-to-const Summary

**Added no-extraction passthrough for import preservation, inlinedQrl(null) binding stripping, and hoist-to-const pattern for inline strategy with transpilation, gaining 3 new convergence tests (28 total passing)**

## Changes Made

### Task 1: No-extraction passthrough and inlinedQrl(null) detection

Added early passthrough in transform.ts when `extractions.length === 0` and no JSX transpilation is needed. The passthrough preserves all original imports, inserts a `//` separator between imports and body, and strips unused variable bindings wrapping `inlinedQrl(null, ...)` calls. The passthrough is gated on `!needsJsxTransform` to avoid bypassing JSX transpilation for `.tsx` files that have zero extractions but still need JSX processing.

Extended Step 4a in rewrite-parent.ts to also detect and strip unused bindings wrapping `inlinedQrl()` calls (not just extraction call sites), ensuring the fix works for files that go through the full pipeline.

**Commit:** c8427ea

### Task 2: Hoist-to-const pattern for inline strategy

Extended the `isHoist` condition in Step 5c of rewrite-parent.ts to also trigger when `entryType === 'inline'` AND both `transpileTs` and `jsxOptions.enableJsx` are true. This matches the Rust optimizer behavior where inline strategy with transpilation produces `const varName = () => { body }; qrlVar.s(varName);` instead of `qrlVar.s(() => { body })`.

**Commit:** 9007b73

## Verification

- Convergence tests: 28 passing (up from 25), zero regressions
- Unit tests: 404 passing, zero regressions
- New passing tests:
  - issue_476 (no-extraction import preservation)
  - should_ignore_null_inlined_qrl (pre-existing inlinedQrl passthrough)
  - inlined_qrl_uses_identifier_reference_when_hoisted_snapshot (hoist-to-const for inline)
- should_not_generate_conflicting_props_identifiers shows improvement (hoist pattern applied) but still fails due to separate destructuring/restProps issues

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gated passthrough on JSX transpilation check**
- **Found during:** Task 1
- **Issue:** Initial passthrough for zero-extraction files also triggered for `.tsx` files that needed JSX transpilation (e.g., unit tests with JSX but no `$()` markers), causing 12 unit test regressions
- **Fix:** Added `!needsJsxTransform` gate to passthrough condition, computed from `transpileJsx !== false` and file extension
- **Files modified:** src/optimizer/transform.ts
- **Commit:** c8427ea

## Self-Check: PASSED
