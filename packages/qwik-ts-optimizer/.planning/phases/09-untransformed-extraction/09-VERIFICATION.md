---
phase: 09-untransformed-extraction
verified: 2026-04-10T03:05:00Z
status: gaps_found
score: 1/3
overrides_applied: 0
gaps:
  - truth: "All 11 snapshots pass parent + segment AST comparison"
    status: failed
    reason: "Only 2 of 11 target snapshots pass. 8 fail on parent module mismatch (variable migration, duplicate export handling, PURE annotation differences). 1 fails on segment mismatch (example_immutable_analysis segments differ)."
    artifacts:
      - path: "src/optimizer/rewrite-parent.ts"
        issue: "Parent rewriting does not produce correct output for 8 snapshots: variable migration (const t = translate() not simplified), duplicate export handling, PURE annotation format"
      - path: "src/optimizer/extract.ts"
        issue: "Segment extraction for example_immutable_analysis produces incorrect segments despite input repair fixing parse errors"
    missing:
      - "Variable migration: const t = translate() simplification in parent for non-Qwik marker snapshots"
      - "Duplicate export handling for shadowed variable snapshots"
      - "PURE annotation format matching expected output"
      - "Segment codegen fixes for example_immutable_analysis"
      - "Parent rewriting fixes for example_qwik_react (JSX transpilation, @builder.io conversion, _auto_filterProps migration)"
      - "Parent rewriting fixes for example_renamed_exports"
      - "Parent rewriting fixes for example_server_auth"
---

# Phase 9: Untransformed Extraction Verification Report

**Phase Goal:** All 11 untransformed snapshots pass (extraction not currently happening)
**Verified:** 2026-04-10T03:05:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All 11 snapshots pass parent + segment AST comparison | FAILED | Only 2/11 pass: example_3, should_preserve_non_ident_explicit_captures. 8 fail parent, 1 fails segments. |
| 2 | All previously-locked snapshots still pass | VERIFIED | 34 convergence tests pass total (up from ~33 pre-phase). No previously-passing test regressed. |
| 3 | Zero regressions in unit tests | VERIFIED | 477 unit tests pass across 32 test files. Zero failures. |

**Score:** 2/3 truths verified (1 roadmap success criterion FAILED)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/marker-detection.ts` | Broadened isMarkerCall for any $-suffixed import | VERIFIED | `importedName.endsWith('$')` check found at line 166 |
| `src/optimizer/extract.ts` | importSource field + isInlinedQrl detection | VERIFIED | importSource (4 refs), isInlinedQrl (4 refs) present |
| `src/optimizer/rewrite-calls.ts` | getQrlImportSource with originalSource param | VERIFIED | Updated with isQwikPackage helper |
| `src/optimizer/rewrite-parent.ts` | Import assembly using importSource + .w() syntax | VERIFIED | .w() capture syntax implemented (multiple references) |
| `src/optimizer/input-repair.ts` | Input preprocessing for parse error recovery | VERIFIED | File exists, repairInput called from transform.ts |
| `src/optimizer/transform.ts` | repairInput integration | VERIFIED | Import at line 16, call at line 368 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| marker-detection.ts | extract.ts | importedName.endsWith('$') | WIRED | isMarkerCall returns true for non-Qwik imports |
| extract.ts | rewrite-parent.ts | importSource field | WIRED | importSource propagated to getQrlImportSource |
| input-repair.ts | transform.ts | repairInput() call | WIRED | Called before extractSegments in pipeline |
| extract.ts | transform.ts | isInlinedQrl flag | WIRED | inlinedQrl detection gating capture analysis |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| example_3 passes convergence | vitest -t example_3 | PASS | PASS |
| should_preserve_non_ident_explicit_captures passes | vitest -t should_preserve_non_ident | PASS | PASS |
| example_server_auth passes | vitest -t example_server_auth | Parent mismatch | FAIL |
| example_renamed_exports passes | vitest -t example_renamed_exports | Parent mismatch | FAIL |
| should_not_auto_export_var_shadowed_in_catch passes | vitest -t shadowed_in_catch | Parent mismatch | FAIL |
| should_not_inline_exported_var_into_segment passes | vitest -t not_inline_exported | Parent mismatch | FAIL |
| example_immutable_analysis passes | vitest -t example_immutable_analysis | Segment mismatch | FAIL |
| example_qwik_react passes | vitest -t example_qwik_react | Parent mismatch | FAIL |
| Unit test regression check | vitest run (excl convergence) | 477 pass, 0 fail | PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | No TODOs, FIXMEs, or placeholders found | - | - |

### Requirements Coverage

No requirement IDs specified for this phase.

### Human Verification Required

None -- all checks are automated via convergence tests.

### Gaps Summary

**9 of 11 target snapshots fail.** The phase achieved foundational infrastructure (broadened marker detection, input repair, inlinedQrl support) but did not close the gap to passing convergence tests for most snapshots. The summaries acknowledge this explicitly -- the 09-01-SUMMARY notes "7 target snapshots still fail due to pre-existing issues unrelated to marker detection: variable migration, duplicate export handling, and PURE annotation format differences." The 09-03-SUMMARY notes "example_qwik_react needs additional subsystem fixes beyond inlinedQrl to pass."

The failing snapshots need additional work in:
1. **Variable migration** -- parent modules need `const t = translate()` simplification for non-Qwik marker call sites
2. **Duplicate export handling** -- the 4 shadowed-variable snapshots have export conflicts
3. **PURE annotation format** -- `/*#__PURE__*/` placement differs from expected
4. **example_immutable_analysis segments** -- segment bodies differ even though parent now matches
5. **example_qwik_react** -- needs JSX transpilation in segments, @builder.io to @qwik.dev conversion, _auto_filterProps migration

The phase goal "All 11 untransformed snapshots pass" is not achieved. Only 2/11 pass.

---

_Verified: 2026-04-10T03:05:00Z_
_Verifier: Claude (gsd-verifier)_
