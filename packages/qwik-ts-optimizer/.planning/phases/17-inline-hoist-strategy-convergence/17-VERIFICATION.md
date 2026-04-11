---
phase: 17-inline-hoist-strategy-convergence
verified: 2026-04-11T13:42:00Z
status: gaps_found
score: 2/4
overrides_applied: 0
gaps:
  - truth: "Running convergence tests on inline-strategy snapshots produces zero .s() body AST mismatches"
    status: failed
    reason: "All 13 inline/hoist convergence tests still fail. Infrastructure changes (import ordering, shared SignalHoister) were completed but remaining failures are caused by body codegen, capture classification, JSX transforms, and _qrlSync serialization -- domains covered by phases 18-20."
    artifacts:
      - path: "tests/optimizer/convergence.test.ts"
        issue: "13 inline/hoist tests fail (0 pass); convergence stayed at 73/210 baseline"
    missing:
      - "Body codegen fixes for .s() body text generation (capture injection, nested QRL rewriting, JSX transform ordering)"
      - "Capture classification convergence (params vs _captures vs .w()) -- Phase 18"
      - "JSX transform convergence (var/const classification in body JSX) -- Phase 19"
  - truth: "Running convergence tests on hoist-strategy snapshots produces zero const-fn pattern AST mismatches"
    status: failed
    reason: "Hoist-strategy snapshot tests (example_reg_ctx_name_segments_hoisted, hoisted_fn_signal_in_loop) still fail. Shared SignalHoister infrastructure is in place but remaining mismatches are in body codegen and JSX transform domains."
    artifacts:
      - path: "tests/optimizer/convergence.test.ts"
        issue: "Hoist-strategy tests still fail despite _hf deduplication fix"
    missing:
      - "Hoist const-fn body codegen convergence with SWC expected output"
deferred:
  - truth: "Running convergence tests on inline-strategy snapshots produces zero .s() body AST mismatches"
    addressed_in: "Phase 18, Phase 19, Phase 20"
    evidence: "Phase 18 goal: 'Capture delivery mechanism matches SWC behavioral rules'; Phase 19 goal: 'JSX output matches SWC behavioral rules'; Phase 20 goal: 'Variable migration decisions and _qrlSync serialization match SWC behavioral rules'. SUMMARY-02 documents remaining root causes as capture classification, JSX prop classification, body codegen, _qrlSync -- all covered by phases 18-20."
  - truth: "Running convergence tests on hoist-strategy snapshots produces zero const-fn pattern AST mismatches"
    addressed_in: "Phase 18, Phase 19, Phase 20"
    evidence: "Same root causes as inline failures -- capture classification, JSX transforms, body codegen -- covered by phases 18-20."
---

# Phase 17: Inline/Hoist Strategy Convergence Verification Report

**Phase Goal:** Inline and hoist entry strategies produce AST-matching output for all affected snapshots
**Verified:** 2026-04-11T13:42:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running convergence tests on inline-strategy snapshots produces zero .s() body AST mismatches | FAILED | 13 inline/hoist tests fail (0 pass); convergence stayed at 73/210 baseline |
| 2 | Running convergence tests on hoist-strategy snapshots produces zero const-fn pattern AST mismatches | FAILED | Hoist-strategy tests (example_reg_ctx_name_segments_hoisted, hoisted_fn_signal_in_loop) still fail |
| 3 | Entry strategy selection assigns the correct strategy per snapshot (no strategy misidentification) | VERIFIED | No evidence of strategy misidentification; failures are in body codegen, not strategy selection |
| 4 | All 73 previously-passing snapshots still pass (zero regressions) | VERIFIED | 73 passed confirmed in convergence test run; 557 unit tests pass; TypeScript compiles cleanly |

**Score:** 2/4 truths verified

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Zero inline-strategy .s() body AST mismatches | Phase 18, 19, 20 | SUMMARY-02 documents remaining root causes: capture classification (Phase 18), JSX prop classification (Phase 19), body codegen + _qrlSync (Phase 20) |
| 2 | Zero hoist-strategy const-fn AST mismatches | Phase 18, 19, 20 | Same root causes as inline failures -- all covered by later convergence phases |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/rewrite-parent.ts` | Import ordering fix + shared SignalHoister + _hf deduplication | VERIFIED | Line 1555: `Array.from(neededImports.entries())` without sort; Line 1418: shared hoister creation; Lines 1542-1546: deduplication via `sharedHoister.getDeclarations()` |
| `src/optimizer/jsx-transform.ts` | Optional sharedSignalHoister parameter in transformAllJsx | VERIFIED | Line 1151: `sharedSignalHoister?: SignalHoister` parameter; Line 1155: `sharedSignalHoister ?? new SignalHoister()` fallback |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| rewrite-parent.ts | neededImports Map | `Array.from(neededImports.entries())` without `.sort()` | WIRED | Line 1555 confirmed; no `localeCompare` found in file |
| rewrite-parent.ts | jsx-transform.ts | Shared SignalHoister passed to transformAllJsx | WIRED | Line 710: `sharedSignalHoister` passed through transformSCallBody -> transformAllJsx |
| rewrite-parent.ts | neededImports | _captures suppression for inline | NOT APPLICABLE | Plan 02 reverted _captures suppression after regression -- inline .s() bodies DO use _captures for non-event-handler captures |

### Data-Flow Trace (Level 4)

Not applicable -- these are compiler transform modules, not UI components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 73 convergence tests pass | `npx vitest run tests/optimizer/convergence.test.ts` | 73 passed, 137 failed (210 total) | PASS (zero regressions) |
| Unit tests pass | `npx vitest run` | 557 passed, 138 failed (695 total) | PASS (unit tests stable) |
| TypeScript compiles | `npx tsc --noEmit` | 0 errors | PASS |
| No alphabetical sort on imports | `grep localeCompare rewrite-parent.ts` | No matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IHS-01 | 17-01, 17-02 | Inline strategy `.s()` body text produces AST-matching output for all inline-strategy snapshots | BLOCKED | 0/13 inline/hoist tests pass; infrastructure in place but body codegen/capture/JSX issues remain. **REQUIREMENTS.md incorrectly marks this as [x] Complete.** |
| IHS-02 | 17-01, 17-02 | Hoist strategy generates correct const-fn pattern producing AST-matching output for all hoist-strategy snapshots | BLOCKED | Hoist tests still fail; same root causes as IHS-01. **REQUIREMENTS.md incorrectly marks this as [x] Complete.** |
| IHS-03 | 17-01, 17-02 | Entry strategy selection produces the correct segment structure per snapshot expected output | SATISFIED | No evidence of strategy misidentification in failures; failures are in body codegen, not strategy selection |

**Note:** REQUIREMENTS.md marks IHS-01, IHS-02, IHS-03 as `[x] Complete` but IHS-01 and IHS-02 are NOT complete per convergence test evidence. These checkboxes should be reverted to `[ ]` until phases 18-20 close the remaining body codegen gaps.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | No TODO/FIXME/placeholder patterns in modified files | - | - |

### Human Verification Required

None -- all verification is programmatic via convergence test suite.

### Gaps Summary

The phase completed its **planned infrastructure work** correctly:
1. Import ordering changed from alphabetical to Map insertion order (matching SWC)
2. Shared SignalHoister prevents _hf counter duplication across body transforms
3. Zero regressions in 73 previously-passing tests and 557 unit tests

However, the **roadmap success criteria** ("zero .s() body AST mismatches", "zero const-fn pattern AST mismatches") are NOT met. Zero inline/hoist tests pass. The SUMMARY-02 explicitly documents that remaining failures are caused by capture classification, JSX transforms, body codegen, and _qrlSync serialization -- all of which are explicitly scheduled for phases 18, 19, and 20.

**Root cause of gap:** The roadmap success criteria for Phase 17 are broader than what the phase's two plans could address. The plans correctly targeted the widest-blast-radius issues (import ordering, _hf deduplication) but the remaining inline/hoist failures have cross-cutting root causes in other convergence domains.

**Recommendation:** The deferred items are genuinely covered by phases 18-20. However, REQUIREMENTS.md should revert IHS-01 and IHS-02 to unchecked (`[ ]`) until those later phases close the gaps.

---

_Verified: 2026-04-11T13:42:00Z_
_Verifier: Claude (gsd-verifier)_
