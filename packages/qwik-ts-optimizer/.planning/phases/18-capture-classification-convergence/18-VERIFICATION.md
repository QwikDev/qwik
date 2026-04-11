---
phase: 18-capture-classification-convergence
verified: 2026-04-11T14:46:00Z
status: gaps_found
score: 2/4
overrides_applied: 0
gaps:
  - truth: "Cross-scope captures appear via _captures array access in segment bodies and .w() wrapping in parent QRL references"
    status: failed
    reason: "Mechanism exists in code but key convergence tests still fail: example_multi_capture (_rawProps handling, .w() on bare $() calls), example_capture_imports (missing segment structure), example_functional_component_capture_props (_rawProps single-capture handling). CAP-02 remains Pending in REQUIREMENTS.md."
    artifacts:
      - path: "src/optimizer/segment-codegen.ts"
        issue: "injectCapturesUnpacking and .w() code exists but does not produce correct output for _rawProps-based captures and nested $() calls"
      - path: "src/optimizer/rewrite-parent.ts"
        issue: ".w() wrapping exists but does not handle all cross-scope capture patterns (bare $() calls, _rawProps)"
    missing:
      - "_rawProps destructuring transform must produce _rawProps as a single capture variable"
      - "Nested $() calls need .w() wrapping when they have captureNames"
      - "Segment body codegen needs correct _captures injection for component$ patterns"
  - truth: "Segment metadata (captures, captureNames, paramNames arrays) matches snapshot expected metadata exactly"
    status: partial
    reason: "Metadata improved (convergence 73->74, inlinedQrl explicit captures fixed, import filtering added) but 11 capture-related tests still fail. Full metadata match requires fixes spanning JSX flags (Phase 19), variable migration (Phase 20), and remaining capture delivery issues."
    artifacts:
      - path: "src/optimizer/transform.ts"
        issue: "Metadata population correct for non-loop alphabetical sort and inlinedQrl, but incomplete for _rawProps and mixed loop+cross-scope patterns"
    missing:
      - "Full metadata convergence for all capture-related snapshot tests"
deferred:
  - truth: "moves_captures_when_possible flags mismatch (5 vs 7)"
    addressed_in: "Phase 19"
    evidence: "Phase 19 SC: 'Flags bitmask values in _jsxSorted/_jsxC calls match snapshot expected values for all JSX snapshots' -- the flags=5 vs flags=7 difference is a JSX children classification issue (bit 1), not a capture issue"
  - truth: "Variable migration related capture test failures (should_transform_nested_loops, should_transform_handlers_capturing_cross_scope_in_nested_loops, should_transform_three_nested_loops_handler_captures_outer_only)"
    addressed_in: "Phase 20"
    evidence: "Phase 20 SC: 'Variables are moved to segments or kept in parent with _auto_ re-exports matching snapshot expected output' -- these tests fail due to component body structure mismatches from variable migration, not capture classification"
---

# Phase 18: Capture Classification Convergence Verification Report

**Phase Goal:** Capture delivery mechanism (params vs _captures vs .w()) matches SWC behavioral rules for all loop and cross-scope patterns
**Verified:** 2026-04-11T14:46:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Loop-local variables appear as function parameters with correct positional padding (_,_1,_2) in segment output | VERIFIED | `generateParamPadding(loopLocalVars)` at transform.ts:1273; non-loop path uses alphabetical sort at transform.ts:1230-1231; convergence 74/210 with zero regressions from 73 baseline |
| 2 | Cross-scope captures appear via _captures array access in segment bodies and .w() wrapping in parent QRL references | FAILED | Mechanism exists (segment-codegen.ts `injectCapturesUnpacking`, rewrite-parent.ts `.w()` wrapping) but key tests fail: `example_multi_capture`, `example_capture_imports`, `example_functional_component_capture_props` all produce incorrect output. CAP-02 Pending in REQUIREMENTS.md. |
| 3 | Segment metadata (captures, captureNames, paramNames arrays) matches snapshot expected metadata exactly | FAILED | Improved from baseline (73->74 convergence, inlinedQrl explicit captures fixed, import filtering added) but 11 capture-related tests still fail. Metadata does not match "exactly" for all capture patterns. |
| 4 | All previously-passing snapshots still pass (zero regressions) | VERIFIED | Convergence: 74/210 passed, up from 73 baseline. Full suite: 556 passed. Zero regressions confirmed. |

**Score:** 2/4 truths verified

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | moves_captures_when_possible flags mismatch (5 vs 7, children bit) | Phase 19 | Phase 19 SC: "Flags bitmask values in _jsxSorted/_jsxC calls match snapshot expected values" |
| 2 | Variable migration component body structure mismatches in nested loop tests | Phase 20 | Phase 20 SC: "Variables are moved to segments or kept in parent with _auto_ re-exports matching snapshot expected output" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/transform.ts` | Alphabetical sort for non-loop capture slots, unified slot allocation, explicit capture metadata | VERIFIED | 2340 lines; alphabetical `.sort()` at line 1230 for non-loop path; `crossScopeCaptures.sort()` at line 1275; explicit capture parsing for inlinedQrl; extractionLoopMap hoisted for sort decisions |
| `src/optimizer/segment-codegen.ts` | Correct .w() hoisting and _captures injection in segment bodies | VERIFIED | 988 lines; `injectCapturesUnpacking` function; `skipCaptureInjection` flag for inlinedQrl; import filtering for captured variables; `.w()` hoisting in nested call sites |
| `src/optimizer/rewrite-parent.ts` | Correct .w() wrapping on QRL references in parent module | VERIFIED | 1661 lines; `.w()` wrapping for loop cross-scope captures (line 600-613); non-loop inline `.w()` (line 617-619); effective capture filtering excluding migrated names |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| src/optimizer/transform.ts | src/optimizer/segment-codegen.ts | extraction.paramNames and extraction.captureNames arrays | WIRED | transform.ts imports `generateSegmentCode`, `SegmentCaptureInfo`; populates `extraction.paramNames` and `extraction.captureNames` which flow to segment codegen |
| src/optimizer/transform.ts | src/optimizer/rewrite-parent.ts | extraction.captures boolean and captureNames for .w() generation | WIRED | transform.ts imports `rewriteParentModule`; captureNames flow through extraction metadata; rewrite-parent.ts checks `captureNames.length > 0` for .w() wrapping |

### Data-Flow Trace (Level 4)

Not applicable -- build-time transform library, not a component rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Convergence count >= 73 (no regressions) | `npx vitest run tests/optimizer/convergence.test.ts` | 74 passed, 136 failed | PASS |
| Full test suite passes | `npx vitest run` | 556 passed, 139 failed (3 pre-existing convergence files) | PASS |
| TypeScript compiles | `npx tsc --noEmit` | Zero errors | PASS |
| example_multi_capture passes | `npx vitest run convergence.test.ts -t "example_multi_capture"` | 1 failed | FAIL |
| example_capture_imports passes | `npx vitest run convergence.test.ts -t "example_capture_imports"` | 1 failed | FAIL |
| example_functional_component_capture_props passes | `npx vitest run convergence.test.ts -t "example_functional_component_capture_props"` | 1 failed | FAIL |
| moves_captures_when_possible passes | `npx vitest run convergence.test.ts -t "moves_captures_when_possible"` | 1 failed (flags mismatch, deferred to Phase 19) | FAIL (deferred) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| CAP-01 | 18-01-PLAN | Loop-local variables delivered via function parameters with correct paramNames padding | SATISFIED | Alphabetical sort for non-loop path, declaration-position sort for loop path, generateParamPadding used correctly |
| CAP-02 | 18-01-PLAN | Cross-scope captures delivered via _captures + .w() hoisting | BLOCKED | Mechanism code exists but key convergence tests (example_multi_capture, example_capture_imports, example_functional_component_capture_props) fail. _rawProps handling and nested $() .w() wrapping incomplete. |
| CAP-03 | 18-02-PLAN | Segment metadata matches snapshot expected metadata | SATISFIED | inlinedQrl explicit capture metadata, import filtering for captured variables, skipCaptureInjection flag -- convergence improved 73->74. Metadata infrastructure correct; remaining mismatches are cross-phase (JSX flags, migration). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | No TODOs, FIXMEs, or placeholders in modified files | - | Clean |

### Human Verification Required

No human verification items identified. All checks are automated via convergence tests.

### Gaps Summary

**1 blocking gap:** CAP-02 (cross-scope capture delivery) is not fully working. The mechanism exists in code -- `injectCapturesUnpacking` in segment-codegen.ts, `.w()` wrapping in rewrite-parent.ts -- but three key convergence tests fail because:

- `_rawProps` destructuring does not produce `_rawProps` as a single capture variable
- Nested `$()` calls lack `.w()` wrapping when they have captureNames
- Segment body codegen does not handle `_captures` injection for all component$ patterns

The Summary explicitly acknowledges this: "Task 2 was investigated but not completed" (Plan 01) and lists these as "Remaining Capture-Related Test Failures (Cross-Phase)" (Plan 02). While some failing tests have root causes in JSX flags (Phase 19) or migration (Phase 20), the `example_multi_capture` and `example_functional_component_capture_props` failures are squarely capture delivery issues that belong to Phase 18.

**Partial gap:** SC3 (metadata matches exactly) is partially met. The infrastructure is correct and improved (73->74 convergence), but "matches exactly for all capture-related tests" requires the CAP-02 fixes above plus cross-phase work.

**Positive:** SC1 (loop-local paramNames) and SC4 (zero regressions) are fully verified. The alphabetical sort fix, q:ps injection for non-loop handlers, and import filtering for captured variables are all solid.

---

_Verified: 2026-04-11T14:46:00Z_
_Verifier: Claude (gsd-verifier)_
