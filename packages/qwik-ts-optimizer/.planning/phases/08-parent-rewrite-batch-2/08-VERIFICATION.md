---
phase: 08-parent-rewrite-batch-2
verified: 2026-04-10T01:30:00Z
status: gaps_found
score: 1/3
overrides_applied: 0
gaps:
  - truth: "All 24 snapshots pass parent + segment AST comparison"
    status: failed
    reason: "Only 12 of 24 Phase 8 target snapshots pass. 12 targets still fail due to prop classification (const/var bucket), regCtxName const inlining, side-effect import preservation, store destructuring optimization, complex multi-component scoping (_jsxSplit), and inline strategy selection issues."
    artifacts:
      - path: "src/optimizer/rewrite-parent.ts"
        issue: "Props wrapping, regCtxName, strip client code, use optimization, fun_with_scopes, qwik_react_inline, root_level_self_referential_qrl_inline, should_not_generate_conflicting_props_identifiers still produce incorrect output"
      - path: "src/optimizer/jsx-transform.ts"
        issue: "Prop classification (const vs var bucket) not matching Rust optimizer for _rawProps components"
    missing:
      - "Prop classification const/var bucket assignment for _rawProps components (blocks 4 props_wrapping variants)"
      - "regCtxName const capture inlining + strategy selection (blocks 2 reg_ctx_name variants)"
      - "Side-effect import preservation for stripped segments (blocks example_strip_client_code)"
      - "Store destructuring chain optimization (blocks example_use_optimization)"
      - "Complex _jsxSplit generation with _getVarProps/_getConstProps (blocks fun_with_scopes)"
      - "Inline strategy _noopQrl+.s() pattern for transpileJsx=false (blocks example_qwik_react_inline)"
      - "Self-referential QRL in inline mode (blocks root_level_self_referential_qrl_inline)"
      - "Capture param renaming to avoid conflicts (blocks should_not_generate_conflicting_props_identifiers)"
  - truth: "All phase 7 locked snapshots + 10 original still pass"
    status: failed
    reason: "1 regression in original 10 baseline: example_skip_transform now fails (was passing at end of Phase 7). Phase 7 targets unchanged at 7/24 (these were already failing before Phase 8)."
    artifacts:
      - path: "src/optimizer/transform.ts"
        issue: "example_skip_transform regression introduced by Phase 8 changes (likely no-extraction passthrough or TS stripping logic)"
    missing:
      - "Fix example_skip_transform regression to restore baseline"
  - truth: "Zero regressions in unit tests"
    status: partial
    reason: "473 unit tests pass with zero regressions. Unit test criterion met. But 1 convergence regression exists (example_skip_transform)."
    artifacts: []
    missing: []
---

# Phase 8: Parent Rewrite Batch 2 Verification Report

**Phase Goal:** Remaining 24 parent-rewrite-only snapshots pass
**Verified:** 2026-04-10T01:30:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All 24 snapshots pass parent + segment AST comparison | FAILED | 12/24 pass. Failing: example_props_wrapping, example_props_wrapping2, example_props_wrapping_children, example_props_wrapping_children2, example_qwik_react_inline, example_reg_ctx_name_segments_hoisted, example_reg_ctx_name_segments_inlined, example_strip_client_code, example_use_optimization, fun_with_scopes, root_level_self_referential_qrl_inline, should_not_generate_conflicting_props_identifiers |
| 2 | All phase 7 locked snapshots + 10 original still pass | FAILED | 1 regression: example_skip_transform (was in original 10, now fails). Phase 7 targets: 7/24 still passing (unchanged from Phase 7 end -- these were already failing). |
| 3 | Zero regressions in unit tests | VERIFIED | 473 unit tests passing, zero regressions. All 32 non-convergence test files pass. |

**Score:** 1/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/rewrite-parent.ts` | TS stripping, capture suppression, _rawProps, _regSymbol, hoist-to-const | VERIFIED | All features implemented: transpileTs param, migratedNames Set, effectiveCaptures filter, applyRawPropsTransform, matchesRegCtxName, _regSymbol wrapping, oxcTransformSync final step |
| `src/optimizer/transform.ts` | transpileTs wiring, no-extraction passthrough, regCtxName threading | VERIFIED | Options threaded through to rewriteParentModule, early passthrough for zero-extraction files |
| `src/optimizer/inline-strategy.ts` | Hoist-to-const for inline strategy | VERIFIED | isHoist extended for inline + transpileTs + transpileJsx |
| `src/optimizer/jsx-transform.ts` | Signal wrapping for children | VERIFIED | processOneChild delegates to analyzeSignalExpression for expression containers |
| `src/optimizer/signal-analysis.ts` | collectAllDeps, store field distinction | VERIFIED | collectAllDeps partitions reactive roots and bare identifiers, isStoreField flag added |
| `src/optimizer/extract.ts` | JSXElement context path, component naming | VERIFIED | Tag name pushed on JSXElement enter, component vs HTML element distinction |
| `src/testing/ast-compare.ts` | BlockStatement normalization | VERIFIED | Single-statement control flow blocks normalized |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| transform.ts | rewrite-parent.ts | transpileTs option | WIRED | transpileTs passed as argument to rewriteParentModule |
| transform.ts | rewrite-parent.ts | regCtxName option | WIRED | regCtxName threaded through InlineStrategyOptions |
| transform.ts | rewrite-parent.ts | no-extraction passthrough | WIRED | extractions.length === 0 check with !needsJsxTransform gate |
| jsx-transform.ts | signal-analysis.ts | analyzeSignalExpression for children | WIRED | processOneChild calls analyzeSignalExpression for JSXExpressionContainer |
| rewrite-parent.ts | oxc-transform | oxcTransformSync final step | WIRED | Called on finalCode when transpileTs is true |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 8 convergence | `npx vitest run tests/optimizer/convergence.test.ts` | 33 passing, 177 failing | FAIL -- only 12/24 Phase 8 targets pass |
| Unit tests | `npx vitest run --exclude convergence` | 473 passing, 0 failing | PASS |
| TypeScript compilation | `npx tsc --noEmit` | 3 pre-existing errors in tests/optimizer/diag.ts | PASS (pre-existing) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | No TODO/FIXME/PLACEHOLDER markers | - | Clean |

### Human Verification Required

No human verification items identified. All checks are automated via convergence tests.

### Gaps Summary

Phase 8 achieved 12/24 target snapshots (50%), up from 0/24 at phase start. The 12 passing targets are:
- example_transpile_ts_only (TS stripping)
- inlined_qrl_uses_identifier_reference_when_hoisted_snapshot (hoist-to-const)
- issue_476 (no-extraction passthrough)
- should_ignore_null_inlined_qrl (inlinedQrl detection)
- should_keep_module_level_var_used_in_both_main_and_qrl (capture suppression)
- should_keep_non_migrated_binding_from_shared_array_destructuring_declarator (capture suppression)
- should_keep_non_migrated_binding_from_shared_destructuring_declarator (capture suppression)
- should_keep_non_migrated_binding_from_shared_destructuring_with_default (capture suppression)
- should_keep_non_migrated_binding_from_shared_destructuring_with_rest (capture suppression)
- should_keep_root_var_used_by_export_decl_and_qrl (capture suppression)
- should_keep_root_var_used_by_exported_function_and_qrl (capture suppression)
- should_not_move_over_side_effects

The 12 failing targets require deeper architectural changes documented in the 08-05-SUMMARY.md deferred issues section. Additionally, 1 regression exists in the original baseline (example_skip_transform).

Overall convergence improved from 21 to 33 tests (+12 net), and unit tests remain clean at 473 passing.

---

_Verified: 2026-04-10T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
