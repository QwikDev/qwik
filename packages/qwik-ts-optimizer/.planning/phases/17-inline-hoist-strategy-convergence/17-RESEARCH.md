# Phase 17: Inline/Hoist Strategy Convergence - Research

**Researched:** 2026-04-11
**Domain:** Qwik optimizer entry strategy codegen (inline/hoist modes)
**Confidence:** HIGH

## Summary

Phase 17 targets all inline and hoist entry strategy snapshot failures. There are 22 inline-strategy snapshots and 14 hoist-strategy snapshots, ALL currently failing. The failures stem from 4 root causes discovered through AST-level diff analysis: (1) import ordering mismatch, (2) hoisted signal declaration (`_hf`) duplication and placement, (3) hoist const+.s() placement relative to original statements, and (4) missing imports for inline/hoist body transformation.

The SWC reference code in `swc-reference-only/transform.rs` and `swc-reference-only/collector.rs` provides the exact behavioral rules. The key insight is that for hoist strategy, the SWC emits `const SymbolName = body; q_SymbolName.s(SymbolName);` immediately before the containing statement (e.g., `export const App = componentQrl(q_...);`), while our code currently puts these in the preamble. For imports, SWC uses discovery order (insertion order into synthetic Vec), not alphabetical.

**Primary recommendation:** Fix import ordering to match SWC discovery order, then fix hoist placement to emit const+.s() inline before containing statements, then fix _hf deduplication for hoist/inline body JSX transforms.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IHS-01 | Inline strategy `.s()` body text produces AST-matching output for all inline-strategy snapshots | Import ordering fix + _captures removal for inline-mode + .s() body spacing fixes (Section: Failure Root Causes #1, #4) |
| IHS-02 | Hoist strategy generates correct const-fn pattern producing AST-matching output for all hoist-strategy snapshots | Hoist placement fix + _hf deduplication + import ordering (Section: Failure Root Causes #1, #2, #3) |
| IHS-03 | Entry strategy selection produces the correct segment structure per snapshot expected output | Current selection logic is correct; failures are in codegen, not selection (Section: Entry Strategy Selection) |
</phase_requirements>

## Failure Root Causes (from AST diff analysis)

### Root Cause 1: Import Ordering Mismatch

**What:** Our code sorts synthetic imports alphabetically (`localeCompare`). SWC uses insertion order -- symbols are added to `synthetic: Vec<(Id, Import)>` in the order they're first requested via `ensure_core_import()` during AST traversal.

**Evidence:** [VERIFIED: AST diff analysis of example_mutable_children, example_derived_signals_div, example_props_wrapping]
- Expected: `_jsxSorted, componentQrl, _noopQrl, _wrapProp` (discovery order)
- Actual: `_fnSignal, _jsxSorted, _noopQrl, _wrapProp, componentQrl` (alphabetical)

**Impact:** Every single inline/hoist test fails partly due to this. Import declarations are AST body statements; their order matters for `fast-deep-equal` comparison.

**Fix:** Change `rewrite-parent.ts` line ~1540 to NOT sort alphabetically. Instead, preserve the order symbols are added to `neededImports` (which is a `Map`, preserving insertion order). The insertion order in our code should already approximate discovery order since we process imports as we encounter them during rewrite.

**Verification from SWC:** `swc-reference-only/collector.rs` line 46: `pub synthetic: Vec<(Id, Import)>` -- Vec preserves insertion order. `transform.rs` line 3411-3418: synthetic imports are emitted in their Vec order. [VERIFIED: swc-reference-only source]

### Root Cause 2: Hoisted Signal Declaration (_hf) Duplication

**What:** For hoist strategy, each component's `.s()` body goes through JSX transform which generates `_hf0, _hf0_str, _hf1, _hf1_str, ...` signal hoisted functions. Our code emits these per-component body, causing duplicates (e.g., multiple `_hf0` declarations). SWC emits them once at module scope with a shared counter.

**Evidence:** [VERIFIED: AST diff of example_mutable_children]
- Expected: 32 statements total (5 components, shared _hf counter)
- Actual: 45 statements (duplicate _hf declarations per component body)

**Impact:** All hoist-strategy tests with JSX signal expressions fail.

**Fix:** The `inlineHoistedDeclarations` array in `rewrite-parent.ts` (line 1392) collects _hf declarations from each `.s()` body transform. These need to be deduplicated -- if `_hf0` is already declared, skip. Better: maintain a single _hf counter across all body transforms and emit declarations once in the preamble. The `sCallJsxOptions.keyCounterStart` already tracks key counter; need similar tracking for _hf counter.

### Root Cause 3: Hoist Const+.s() Placement

**What:** For hoist strategy, SWC emits `const SymbolName = body; q_SymbolName.s(SymbolName);` immediately BEFORE the statement that uses it (e.g., before `export const App = componentQrl(q_App_component_xxx);`). Our code uses `s.appendLeft(stmtStart, ...)` which should work, but the _hf declarations are in the wrong place (preamble vs inline).

**Evidence:** [VERIFIED: AST diff of example_mutable_children, example_derived_signals_div]
- Expected: `...[Fn exports]... const AppDynamic1_component = (props)=>{...}; q_AppDynamic1.s(AppDynamic1_component); export const AppDynamic1 = componentQrl(...);`
- Actual: _hf declarations interspersed; const+.s() pairs displaced

**Impact:** Statement ordering differs, causing AST mismatch even when individual statements are correct.

**Fix:** For hoist strategy, the const+.s() insertion via `s.appendLeft(stmtStart, ...)` is the right approach. The issue is that _hf declarations generated during body transform also need to be inserted at the same position (before the containing statement), not in the preamble. The SWC handles this by hoisting _fnSignal calls to module scope during the fold (transform.rs line 4130: "Hoist _fnSignal calls").

### Root Cause 4: Missing/Extra Imports in Inline Body

**What:** Some inline-strategy tests show `_captures` being imported when it shouldn't be, or missing imports like `_getVarProps`, `_getConstProps`, `_jsxSplit`.

**Evidence:** [VERIFIED: AST diff of example_qwik_react_inline, fun_with_scopes]
- example_qwik_react_inline: actual has `_captures` import but expected doesn't; actual has `jsx` in Fragment import but expected doesn't
- fun_with_scopes: missing `_getVarProps`, `_getConstProps`, `_jsxSplit`, `_fnSignal`; has extra `_captures`

**Impact:** Inline tests with complex JSX or captures fail.

**Fix:** The `_captures` import is being added for inline strategy when it shouldn't be -- in inline mode, captures are referenced via `_captures[N]` inside `.s()` bodies which share the parent module scope. The `_captures` import should still be needed for segment code, but for inline strategy there are no separate segments. Need to audit when `_captures` is added to `neededImports` and suppress it for inline strategy where captures are delivered differently. The missing JSX imports (`_getVarProps` etc.) are likely not being collected during the `.s()` body JSX transform -- the `additionalImports` from `transformSCallBody` may not include all needed JSX symbols.

## Entry Strategy Selection (IHS-03)

**Finding:** The entry strategy selection logic itself is correct. Both `entry-strategy.ts` (resolves entry field) and the `isInlineStrategy` flag in `transform.ts` correctly identify inline/hoist modes. The SWC reference confirms both inline and hoist share the same `InlineStrategy` entry policy. [VERIFIED: swc-reference-only/entry_strategy.rs line 117]

**No changes needed for strategy selection.** All failures are in codegen (how the inline/hoist output is generated), not in which strategy is selected.

## Affected Snapshots

### Inline Strategy (22 snapshots, all failing)

| Snapshot | Key Features | Primary Failure |
|----------|-------------|-----------------|
| example_default_export_index | inline, no transpile | Import order |
| example_strip_client_code | inline, stripCtxName, transpile | Import order + body |
| example_qwik_react_inline | inline, node_modules, explicitExt | Import order + extra _captures + missing export |
| example_parsed_inlined_qrls | inline, prod mode | Import order |
| example_transpile_ts_only | inline, transpileTs only, explicitExt | Import order + body |
| example_preserve_filenames | inline, preserveFilenames, transpileJsx | Import order |
| example_dev_mode_inlined | inline, dev mode, transpile | Import order + PURE annotation |
| example_use_optimization | inline, isServer=false | Import order |
| example_optimization_issue_3542 | inline, isServer=false | Import order |
| example_optimization_issue_3795 | inline, transpile, isServer=false | Import order + body |
| example_optimization_issue_4386 | inline, isServer=false | Import order |
| fun_with_scopes | inline, transpile, complex | Import order + missing imports + _hf |
| example_lib_mode | inline, transpile | Import order + body |
| should_ignore_null_inlined_qrl | inline, transpile | Import order |
| should_not_generate_conflicting_props_identifiers | inline, transpile | Import order |
| should_not_move_over_side_effects | inline, transpile | Import order |
| example_props_optimization | inline, transpileJsx | Import order + body |
| example_input_bind | inline, prod, transpile | Import order + body |
| example_reg_ctx_name_segments | inline, regCtxName, stripEventHandlers | Import order + body |
| example_reg_ctx_name_segments_inlined | inline, regCtxName | Import order + body |
| root_level_self_referential_qrl_inline | inline, dev, node_modules | Import order + body |
| inlined_qrl_uses_identifier_reference_when_hoisted_snapshot | inline, transpile | Import order + body |

### Hoist Strategy (14 snapshots, all failing)

| Snapshot | Key Features | Primary Failure |
|----------|-------------|-----------------|
| example_mutable_children | hoist, transpile, explicitExt | Import order + _hf duplication |
| example_immutable_function_components | hoist, transpile, explicitExt | Import order + _hf duplication |
| example_derived_signals_div | hoist, transpile | Import order + _hf placement |
| example_issue_4438 | hoist, transpile | Import order + _hf |
| example_derived_signals_children | hoist, transpile | Import order + _hf |
| example_derived_signals_multiple_children | hoist, transpile | Import order + _hf |
| example_derived_signals_complext_children | hoist, transpile | Import order + _hf |
| example_derived_signals_cmp | hoist, transpile | Import order + _hf |
| example_issue_33443 | hoist, transpile | Import order + _hf |
| example_reg_ctx_name_segments_hoisted | hoist, transpile, regCtxName | Import order + body |
| example_props_wrapping | hoist, transpile | Import order + _hf + missing stmts |
| example_props_wrapping2 | hoist, transpile | Import order + _hf |
| example_props_wrapping_children | hoist, transpile | Import order + _hf |
| example_props_wrapping_children2 | hoist, transpile | Import order + _hf |

## Architecture Patterns

### Current Code Structure
```
src/optimizer/
  entry-strategy.ts     # resolveEntryField() -- correct, no changes needed
  inline-strategy.ts    # buildNoopQrlDeclaration, buildSCall, buildHoistConstDecl, buildHoistSCall
  rewrite-parent.ts     # Main rewrite pipeline -- Steps 5c (inline/hoist), 5d (imports), 6 (assembly)
  transform.ts          # Orchestrator -- isInlineStrategy flag, migration skip, segment handling
```

### Fix Strategy: Ordered by Blast Radius

**Fix 1 (widest blast radius): Import ordering**
- File: `src/optimizer/rewrite-parent.ts` ~line 1540
- Change: Remove `.sort((a, b) => a[0].localeCompare(b[0]))` on `neededImports.entries()`
- Risk: May affect non-inline/hoist tests that currently pass
- Mitigation: Run full convergence suite after change to verify no regressions in 73 passing tests

**Fix 2: _hf deduplication and shared counter**
- File: `src/optimizer/rewrite-parent.ts` ~line 1392 (inlineHoistedDeclarations) and signal-analysis.ts
- Change: Track which _hf indices have been declared; skip duplicates; share counter across body transforms
- Risk: Low -- only affects inline/hoist strategy paths

**Fix 3: Hoist _hf placement**
- File: `src/optimizer/rewrite-parent.ts` ~line 1566-1573
- Change: For hoist strategy, _hf declarations from body transforms should go to module-scope preamble (matching SWC behavior where _fnSignal calls are hoisted to module scope)
- Risk: Low -- only affects hoist strategy

**Fix 4: _captures import suppression for inline**
- File: `src/optimizer/rewrite-parent.ts` import collection logic
- Change: Don't add `_captures` to neededImports when in inline strategy (captures are delivered via `.w()` not `_captures` array)
- Risk: Low -- only affects inline strategy

### Anti-Patterns to Avoid
- **Sorting imports alphabetically:** The SWC output uses discovery order; sorting breaks AST comparison
- **Per-body _hf emission:** Signal hoisted functions must be shared at module scope, not per-component
- **Preamble placement for hoist const:** Hoist const+.s() must be placed inline before the containing statement, not in a separate preamble block

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import ordering | Custom sort comparator | Map insertion order (already preserves it) | SWC uses insertion order; Map.entries() returns insertion order |
| _hf counter sharing | Separate counter per body | Pass counter through sCallJsxOptions (already partially done for key counter) | Same pattern already exists for JSX key counter |

## Common Pitfalls

### Pitfall 1: Regression in Passing Tests from Import Reorder
**What goes wrong:** Changing import order for inline/hoist strategy may also change it for segment/smart strategy tests that currently pass.
**Why it happens:** The import ordering code is shared across all strategies.
**How to avoid:** The fix should preserve insertion order (Map default) rather than sort. Since passing tests already have correct insertion order (they pass AST comparison), removing the sort should not regress them. But MUST verify with full convergence run.
**Warning signs:** Any of the 73 currently-passing tests failing after the import order change.

### Pitfall 2: _hf Counter Reset Between Components
**What goes wrong:** If the _hf counter resets to 0 for each component body transform, you get duplicate `_hf0` declarations.
**Why it happens:** The SignalHoister or JSX transform creates _hf declarations starting from 0 each time it's invoked.
**How to avoid:** Pass a shared _hf counter start value through `sCallJsxOptions`, similar to how `keyCounterStart` is already passed.
**Warning signs:** Multiple `const _hf0 = ...` in the output.

### Pitfall 3: Hoist .s() Body Type Annotations
**What goes wrong:** Hoist strategy bodies go through `oxcTransformSync` to strip TS types, but this can also reformat `/*#__PURE__*/` to `/* @__PURE__ */`.
**Why it happens:** oxc-transform's output normalization.
**How to avoid:** After TS stripping, post-process to restore `/*#__PURE__*/` format if needed, or apply TS stripping only to the body text before wrapping with PURE annotation.
**Warning signs:** `/* @__PURE__ */` in output where `/*#__PURE__*/` is expected.

## Code Examples

### Current Import Sorting (rewrite-parent.ts ~line 1540)
```typescript
// CURRENT (wrong for AST comparison):
const sortedImports = Array.from(neededImports.entries()).sort((a, b) =>
  a[0].localeCompare(b[0]),
);

// FIX: Remove sort, use Map insertion order:
const sortedImports = Array.from(neededImports.entries());
```
[VERIFIED: source code at src/optimizer/rewrite-parent.ts line 1540]

### SWC Hoist Output Pattern (from example_mutable_children snapshot)
```javascript
// Module-level _hf declarations (shared counter, once)
const _hf0 = (p1)=>p1.value;
const _hf0_str = "(p1)=>p1.value";
// ...

// Before each export statement:
const AppDynamic1_component_R00UJ05gbes = (props)=>{
    return /*#__PURE__*/ _jsxSorted(_Fragment, null, null, ...);
};
q_AppDynamic1_component_R00UJ05gbes.s(AppDynamic1_component_R00UJ05gbes);
export const AppDynamic1 = /*#__PURE__*/ componentQrl(q_AppDynamic1_component_R00UJ05gbes);
```
[VERIFIED: match-these-snaps/qwik_core__test__example_mutable_children.snap]

### SWC Inline .s() Pattern (from example_inlined_entry_strategy snapshot)
```javascript
// .s() calls in preamble with body text directly:
q_Child_component_useStyles_qBZTuFM0160.s('somestring');
q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.s(()=>{
    const state = _captures[0];
    state.count = thing.doStuff() + import("./sibling");
});
q_Child_component_div_q_e_click_cROa4sult1s.s(()=>console.log(mongodb));
q_Child_component_9GyF01GDKqw.s(()=>{
    useStylesQrl(q_Child_component_useStyles_qBZTuFM0160);
    const state = useStore({ count: 0 });
    useBrowserVisibleTaskQrl(q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.w([state]));
    return <div q-e:click={q_Child_component_div_q_e_click_cROa4sult1s}></div>;
});
```
[VERIFIED: match-these-snaps/qwik_core__test__example_inlined_entry_strategy.snap]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts -t "SNAPSHOT_NAME"` |
| Full suite command | `npx vitest run tests/optimizer/convergence.test.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IHS-01 | Inline .s() body AST match | snapshot convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_inlined_entry_strategy"` (and all 22 inline tests) | Exists (convergence.test.ts) |
| IHS-02 | Hoist const-fn AST match | snapshot convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_mutable_children"` (and all 14 hoist tests) | Exists (convergence.test.ts) |
| IHS-03 | Strategy selection correctness | snapshot convergence | Same convergence tests -- strategy selection is implicit in output | Exists |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts` (full 210 snapshots, <1s)
- **Per wave merge:** Same + `npx vitest run` (all tests)
- **Phase gate:** All 73 previously-passing tests still pass + inline/hoist tests now pass

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements through convergence.test.ts.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Removing alphabetical import sort will not regress 73 passing tests | Root Cause 1 | Medium -- could break passing tests if their import discovery order differs from alphabetical |
| A2 | _hf counter is the primary cause of statement count mismatch in hoist tests | Root Cause 2 | Low -- AST diff clearly shows duplicate _hf declarations |
| A3 | Map insertion order matches SWC discovery order for imports | Root Cause 1 | Medium -- our import discovery sequence may differ from SWC's AST fold order |

## Open Questions (RESOLVED)

1. **Import discovery order fidelity** (RESOLVED — Plan 17-01 removes alphabetical sort; convergence tests verify order matches SWC)
   - What we know: SWC uses insertion order (Vec). Our neededImports is a Map (insertion order).
   - What's unclear: Whether our code adds symbols to neededImports in the same order SWC calls ensure_core_import. The SWC processes statements in AST order; our code may process in different order (e.g., JSX symbols before call rewrite symbols).
   - Recommendation: After removing sort, run convergence tests. If import order still differs, trace the insertion order and compare to SWC reference to identify the ordering gap.

2. **_hf counter sharing mechanism** (RESOLVED — Plan 17-02 checks SignalHoister API and adds shared counter)
   - What we know: The JSX key counter is already shared via `sCallJsxOptions.keyCounterStart`. A similar mechanism is needed for _hf signal function counter.
   - What's unclear: Whether SignalHoister in signal-analysis.ts already supports an offset parameter.
   - Recommendation: Check SignalHoister API during implementation; may need to add a `hfCounterStart` parameter.

## Sources

### Primary (HIGH confidence)
- `swc-reference-only/transform.rs` -- Hoist drain pattern (lines 3367-3408), .s() call creation (line 2995), import assembly (lines 3410-3460) [VERIFIED: local source]
- `swc-reference-only/collector.rs` -- Synthetic imports Vec (line 46), import() method (line 158) [VERIFIED: local source]
- `swc-reference-only/entry_strategy.rs` -- Inline/Hoist share InlineStrategy (line 117) [VERIFIED: local source]
- `match-these-snaps/` -- All 36 inline/hoist snapshots examined for expected output patterns [VERIFIED: local files]
- `src/optimizer/rewrite-parent.ts` -- Import sorting at line 1540, hoist logic at lines 1388-1534 [VERIFIED: local source]
- AST diff analysis -- Direct comparison of expected vs actual program body statements [VERIFIED: vitest execution]

### Secondary (MEDIUM confidence)
- `tests/optimizer/snapshot-options.ts` -- Complete mapping of snapshot names to entry strategies [VERIFIED: local source]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already in place, no new dependencies
- Architecture: HIGH -- root causes identified via direct AST comparison, SWC reference verified
- Pitfalls: HIGH -- based on observed actual failures, not speculation

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- internal codebase analysis)
