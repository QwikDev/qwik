---
phase: 07-parent-rewrite-batch-1
verified: 2026-04-11T04:50:00Z
status: gaps_found
score: 1/3
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/3
  gaps_closed: []
  gaps_remaining:
    - "All 24 snapshots pass parent + segment AST comparison"
  regressions:
    - "Score dropped from 2/3 to 1/3: unit test count changed (489 -> 494 passing from 471 baseline, but success criterion says 'zero regressions in 471 unit tests' and 494 > 471, so no regression -- however the truth wording is strict at 'zero regressions' which is met)"
gaps:
  - truth: "All 24 snapshots pass parent + segment AST comparison"
    status: failed
    reason: "Only 7 of 24 Phase 7 target snapshots pass. Gap closure plans 03-05 improved from 2/24 to 7/24 but 17 snapshots still fail. Failures span signal wrapping in children, _fnSignal hoisting, loop context flags, symbol naming context, inlinedQrl format, destructuring optimization, .s() placement, and aliased import resolution."
    artifacts:
      - path: "src/optimizer/rewrite-parent.ts"
        issue: "Hoist and inline body transformation implemented but insufficient for 17/24 snapshots. Missing: signal wrapping in children position, _fnSignal calibration, loop context flags, symbol naming context stack, inlinedQrl format, destructuring (_rawProps), .s() call placement ordering, aliased import resolution."
      - path: "src/optimizer/jsx-transform.ts"
        issue: "Signal analysis only handles props position, not children position. Loop context flag incorrectly set for simple .map() calls."
    missing:
      - "Signal wrapping (_wrapProp) in JSX children position (blocks: mutable_children, derived_signals_*, input_bind)"
      - "_fnSignal hoisting calibration to match Rust optimizer behavior (blocks: issue_4438, derived_signals_*)"
      - "Loop context flag correction for simple .map() calls (blocks: derived_signals_complext_children)"
      - "Symbol naming context stack fix: event handlers in component children need Cmp_p context (blocks: dev_mode_inlined, preserve_filenames)"
      - "inlinedQrl() inline call format instead of _noopQrl + .s() (blocks: lib_mode)"
      - "Pre-transpiled input re-processing pipeline (blocks: parsed_inlined_qrls)"
      - "Destructuring optimization (_rawProps pattern) (blocks: optimization_issue_3542, props_optimization)"
      - ".s() call placement ordering relative to module-level declarations (blocks: optimization_issue_4386)"
      - "Aliased import resolution in extraction pipeline (blocks: missing_custom_inlined_functions)"
      - "JSX whitespace normalization differences (blocks: mutable_children, derived_signals_*)"
---

# Phase 7: Parent Rewrite Batch 1 Verification Report

**Phase Goal:** First 24 parent-rewrite-only snapshots pass (segments already OK, fix parent module shape)
**Verified:** 2026-04-11T04:50:00Z
**Status:** gaps_found
**Re-verification:** Yes -- after gap closure (Plans 03, 04, 05)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All 24 snapshots pass parent + segment AST comparison | FAILED | 7/24 pass: example_1, example_default_export_index, example_functional_component, example_immutable_function_components, example_inlined_entry_strategy, example_optimization_issue_3561, example_optimization_issue_3795. 17 still fail. |
| 2 | All 10 previously-passing snapshots still pass | VERIFIED | All 10 confirmed passing: example_2, example_4, example_5, example_6, example_default_export_invalid_ident, example_fix_dynamic_import, example_skip_transform, example_strip_exports_unused, issue_117, special_jsx. |
| 3 | Zero regressions in unit tests | VERIFIED | 494 unit tests passing (grew from 471 baseline). 32/33 test files pass. No regressions. |

**Score:** 1/3 truths verified (Truth 1 is the primary goal)

### Progress Since Initial Verification

| Metric | Initial (Plans 01-02) | After Gap Closure (Plans 03-05) | Delta |
|--------|----------------------|--------------------------------|-------|
| Phase 7 targets passing | 2/24 | 7/24 | +5 |
| Total convergence passing | 16/210 | 21/210 | +5 |
| Unit tests passing | 489 | 494 | +5 |

**New Phase 7 targets fixed by gap closure:**
- example_1 (Plan 03: unused binding removal)
- example_default_export_index (Plan 03: index file display name)
- example_functional_component (Plan 03: Qwik import preservation)
- example_immutable_function_components (Plan 05: hoist const-function pattern)
- example_optimization_issue_3795 (Plan 04: inline JSX transpilation)

### 17 Failing Phase 7 Snapshots -- Root Cause Analysis

| Snapshot | Strategy | Primary Blocker |
|----------|----------|----------------|
| example_derived_signals_children | hoist | Signal wrapping in children + _fnSignal hoisting |
| example_derived_signals_cmp | hoist | Signal wrapping in children + _fnSignal hoisting |
| example_derived_signals_complext_children | hoist | Loop context flags + unused variable stripping |
| example_derived_signals_div | hoist | Signal wrapping in children + _fnSignal hoisting |
| example_derived_signals_multiple_children | hoist | Signal wrapping in children + _fnSignal hoisting |
| example_dev_mode_inlined | inline | Symbol naming context stack (Cmp_p prefix) |
| example_input_bind | inline | Signal wrapping in children (_wrapProp) |
| example_issue_33443 | hoist | _fnSignal hoisting + destructuring |
| example_issue_4438 | hoist | _fnSignal hoisting differences |
| example_lib_mode | inline | inlinedQrl() format (not _noopQrl + .s()) |
| example_missing_custom_inlined_functions | segment | Aliased import resolution in extraction |
| example_mutable_children | hoist | Signal wrapping in children |
| example_optimization_issue_3542 | inline | Destructuring optimization (_rawProps) |
| example_optimization_issue_4386 | inline | .s() call placement ordering |
| example_parsed_inlined_qrls | inline | Pre-transpiled input re-processing |
| example_preserve_filenames | inline | Symbol naming context stack (Cmp_p prefix) |
| example_props_optimization | inline | Destructuring + _jsxSplit + signal analysis |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/rewrite-parent.ts` | Import assembly, .s() body transform, hoist pattern | VERIFIED | All three mechanisms implemented and wired. Hoist body via magic-string appendLeft, inline body via transformSCallBody, imports via preamble.join. |
| `src/optimizer/inline-strategy.ts` | buildSCall, buildHoistConstDecl, buildHoistSCall | VERIFIED | All three functions exported and called from rewrite-parent.ts. |
| `src/optimizer/jsx-transform.ts` | JSX transpilation with child key rules, dynamic flags | VERIFIED | transformAllJsx handles child null-keys (HTML only), dynamic child classification, whitespace preservation. |
| `src/optimizer/transform.ts` | removeUnusedImports, inline migration skip, entryType threading | VERIFIED | All three features present and wired. |
| `src/optimizer/extract.ts` | Index file naming, isIndex flag | VERIFIED | getFileStem returns directory name for index files. |
| `src/testing/ast-compare.ts` | Import order normalization, TS type stripping | VERIFIED | normalizeImportOrder and TS field stripping both present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| rewrite-parent.ts | parent output | preamble assembly Step 6 | WIRED | preamble.join('\n') prepends assembled import block |
| rewrite-parent.ts | inline-strategy.ts | buildSCall, buildHoistConstDecl, buildHoistSCall | WIRED | All three called from Step 5c dispatch |
| rewrite-parent.ts | jsx-transform.ts | transformAllJsx in body transform | WIRED | Called via transformSCallBody when jsxOptions.enableJsx is set |
| transform.ts | rewrite-parent.ts | removeUnusedImports after rewriteParentModule | WIRED | Line ~522 |
| transform.ts | rewrite-parent.ts | entryType in InlineStrategyOptions | WIRED | entryStrategy.type passed through |

### Data-Flow Trace (Level 4)

Not applicable -- optimizer library produces code strings, not rendered UI.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Convergence tests run | `npx vitest run tests/optimizer/convergence.test.ts` | 21 passing, 189 failing (210 total) | Partial -- 7/24 Phase 7 targets pass |
| Unit tests pass | `npx vitest run` | 494 passing, 189 failing (convergence only), 32/33 test files pass | PASS -- no unit regressions |
| Original 10 still pass | Cross-reference passing list | All 10 confirmed | PASS |
| No new bonus regressions | Compare passing list | relative_paths and 2 spread_props tests also pass (bonus) | PASS |

### Requirements Coverage

No requirement IDs specified for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | No TODOs, FIXMEs, or placeholders in modified files | - | Clean |

### Human Verification Required

None -- all verification is automated via convergence test results.

### Gaps Summary

The phase goal requires all 24 target snapshots to pass. After 5 plans (2 initial + 3 gap closure), only 7/24 pass. This is an improvement from the initial verification (2/24) but falls far short of the goal.

**Infrastructure delivered:** The core mechanisms are solid -- import assembly, inline body transformation with JSX transpilation, hoist const-function extraction, TS type stripping, child key rules, and dynamic flag classification all work correctly. The 7 passing snapshots prove the infrastructure is functional.

**Remaining work is feature-deep, not infrastructure-wide.** The 17 failing snapshots each require specific feature additions (signal wrapping in children, _fnSignal calibration, destructuring optimization, symbol naming context, inlinedQrl format, etc.) that go beyond the infrastructure built so far. These are distinct feature areas, not variations of the same fix.

**Recommendation:** The remaining 17 snapshots require at minimum 3-4 additional plans targeting the distinct blocker categories: (1) signal analysis expansion (children position, _fnSignal calibration), (2) symbol naming and .s() placement, (3) destructuring/_rawProps optimization, (4) format variants (inlinedQrl, pre-transpiled input, aliased imports).

---

_Verified: 2026-04-11T04:50:00Z_
_Verifier: Claude (gsd-verifier)_
