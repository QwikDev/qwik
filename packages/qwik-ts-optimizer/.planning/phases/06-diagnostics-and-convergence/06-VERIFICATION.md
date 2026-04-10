---
phase: 06-diagnostics-and-convergence
verified: 2026-04-10T18:38:00Z
status: gaps_found
score: 5/7
overrides_applied: 0
gaps:
  - truth: "All ~180 snapshot tests pass via AST-based comparison with no regressions from previously locked batches"
    status: failed
    reason: "Only 11/209 snapshots pass (5.3%). Convergence is far from the ~180 target. Root causes include JSX transform quality, inlined/noop strategy body format, segment body code differences, and several other categories documented in 06-03-SUMMARY."
    artifacts:
      - path: "tests/optimizer/convergence.test.ts"
        issue: "198 of 210 tests fail (209 snapshot tests + 1 summary; 11 snapshots pass)"
    missing:
      - "Fix remaining ~198 snapshot failures across parent, segment, and combined categories"
      - "Address root causes: JSX transform output format, inlined/lib mode .s() body transformation, preserveFilenames, string literal segment extraction, component() context stack"
  - truth: "Convergence test confirms 209/209 (or near-complete with documented exceptions)"
    status: failed
    reason: "Convergence is 11/209, not near-complete. This is the same root cause as the snapshot truth above."
    artifacts:
      - path: "tests/optimizer/convergence.test.ts"
        issue: "11/209 pass rate, 198 failures remain"
    missing:
      - "Systematic convergence fixes for remaining failure categories (parent-only: 46, segment-only: 72, both: 80)"
---

# Phase 6: Diagnostics and Convergence Verification Report

**Phase Goal:** The optimizer emits correct diagnostics for invalid code patterns and passes all remaining snapshot tests
**Verified:** 2026-04-10T18:38:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | C02 FunctionReference error is emitted when functions or classes cross a $() boundary | VERIFIED | emitC02() in diagnostics.ts, wired via transform.ts line 475, 22 diagnostic tests pass |
| 2 | C03 CanNotCapture and C05 MissingQrlImplementation errors are emitted for their respective invalid patterns | VERIFIED | emitC03(), emitC05() in diagnostics.ts, wired in transform.ts lines 581+, tests pass |
| 3 | @qwik-disable-next-line comment directive suppresses the next diagnostic | VERIFIED | parseDisableDirectives() + filterSuppressedDiagnostics() in diagnostics.ts, wired in transform.ts lines 829-831 |
| 4 | preventdefault-passive-check warning is emitted when both passive:event and preventdefault:event exist | VERIFIED | emitPreventdefaultPassiveCheck() in diagnostics.ts, wired in transform.ts line 593+, dedicated detection function at line 885 |
| 5 | Diagnostics do NOT prevent code generation -- output is always produced alongside diagnostics | VERIFIED | Transform pipeline collects diagnostics in array, continues to completion, returns both code and diagnostics |
| 6 | All ~180 snapshot tests pass via AST-based comparison with no regressions | FAILED | Only 11/209 snapshots pass (5.3%). 198 failures remain. |
| 7 | Convergence test confirms 209/209 or near-complete with documented exceptions | FAILED | 11/209 is far from near-complete. Remaining failures: 46 parent-only, 72 segment-only, 80 both. |

**Score:** 5/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/diagnostics.ts` | Diagnostic emission functions and suppression | VERIFIED | 311 lines, all 4 diagnostic codes + suppression parsing + declaration classification |
| `tests/optimizer/diagnostics.test.ts` | Unit tests for diagnostics | VERIFIED | 390 lines, 22 tests all passing |
| `tests/optimizer/snapshot-options.ts` | SNAPSHOT_OPTIONS map for all 209 snapshots | VERIFIED | 628 lines, covers all snapshots with per-test options |
| `tests/optimizer/convergence.test.ts` | Full convergence test running all 209 snapshots | VERIFIED | 168 lines, runs all 209 snapshots, reports pass/fail with summary |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| transform.ts | diagnostics.ts | import + call emitC02/emitC05/parseDisableDirectives/filterSuppressedDiagnostics | WIRED | Import at line 53, calls at lines 475, 581, 829, 831 |
| convergence.test.ts | snapshot-options.ts | import SNAPSHOT_OPTIONS | WIRED | Import at line 19, getSnapshotTransformOptions() used at line 66 |
| transform.ts | rewrite-parent.ts | import cleanup pass | WIRED | removeUnusedImports() called at line 522 (parent) and line 770 (segments) |
| rewrite-calls.ts | explicitExtensions | parameter threading | WIRED | explicitExtensions parameter at line 51, used to add .js at line 53 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| diagnostics.ts | Diagnostic objects | emitC02/C03/C05 functions | Yes -- pure functions creating structured objects | FLOWING |
| convergence.test.ts | transformModule result | src/optimizer/transform.ts | Yes -- real transform pipeline | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Diagnostic tests pass | npx vitest run tests/optimizer/diagnostics.test.ts | 22/22 pass | PASS |
| Convergence test runs | npx vitest run tests/optimizer/convergence.test.ts | 12/210 pass (11 snapshots + 1 summary) | FAIL |
| Non-convergence suite green | npx vitest run --exclude convergence | 464/464 pass across 29 files | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| DIAG-01 | 06-01 | Emit C02 FunctionReference error for functions/classes crossing $() boundary | SATISFIED | emitC02() implemented and wired, diagnostic tests pass |
| DIAG-02 | 06-01 | Emit C03 CanNotCapture error for invalid captures | SATISFIED | emitC03() implemented and wired, tests pass |
| DIAG-03 | 06-01 | Emit C05 MissingQrlImplementation error for missing $ implementations | SATISFIED | emitC05() implemented and wired, tests pass |
| DIAG-04 | 06-01, 06-02, 06-03 | Support @qwik-disable-next-line comment directive for suppression | SATISFIED | parseDisableDirectives() + filterSuppressedDiagnostics() implemented and wired |

Note: DIAG-04 in REQUIREMENTS.md is defined as "Support @qwik-disable-next-line comment directive for suppression" which IS satisfied. The convergence goal ("All ~180 snapshot tests pass") comes from the ROADMAP success criteria SC-4, not from a DIAG requirement directly. Both the DIAG requirements and the convergence SC are evaluated above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | No TODOs, FIXMEs, or placeholders in diagnostic or convergence files | - | - |

### Human Verification Required

1. **Diagnostic snapshot accuracy**
   - **Test:** Run convergence test on diagnostic-specific snapshots (capturing_fn_class, missing_custom_inlined, should_disable) and verify diagnostic output matches expected format exactly
   - **Expected:** Diagnostic objects match snapshot expectations field-by-field
   - **Why human:** Cannot programmatically verify diagnostic field ordering and exact message text match without running specific snapshot comparisons

### Gaps Summary

The diagnostic features (DIAG-01 through DIAG-04) are fully implemented and working. All 4 diagnostic codes emit correctly, the suppression directive works, and 464 non-convergence tests pass with no regressions.

However, the phase's convergence goal is far from met. Only 11 out of 209 snapshots pass (5.3%), compared to the target of "all ~180 snapshot tests pass." The convergence infrastructure is in place (options map, test harness, import cleanup, explicitExtensions), but the remaining failures span multiple root cause categories:

- **Parent-only failures (46):** Inlined/noop strategy body format, missing callee rewriting patterns
- **Segment-only failures (72):** JSX not transformed in segment bodies, segment body code differences
- **Both fail (80):** Combined parent + segment issues, nested extraction + JSX transform gaps

Root causes identified but not yet fixed: JSX transform output format mismatch, component() context stack, inlined/lib mode .s() body transformation, preserveFilenames option, string literal segment extraction.

The gap between 11/209 and 180+/209 represents substantial remaining work that was not completed in Plans 01-03.

---

_Verified: 2026-04-10T18:38:00Z_
_Verifier: Claude (gsd-verifier)_
