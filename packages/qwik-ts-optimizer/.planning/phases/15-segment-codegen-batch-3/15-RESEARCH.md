# Phase 15: Segment Codegen Batch 3 - Research

**Researched:** 2026-04-10
**Domain:** Segment module code generation -- JSX prop classification, bind desugaring in spread contexts, signal wrapping, flags bitmask, key prefix hashing, variable migration, and unconditional segment JSX transpilation
**Confidence:** HIGH

## Summary

Phase 15 addresses the final 26 segment-codegen snapshots. Of these, 4 already pass (should_merge_on_input_and_bind_checked, should_merge_on_input_and_bind_value, should_split_spread_props, should_split_spread_props_with_additional_prop), leaving 22 failing. Debugging all 22 reveals **8 distinct failure categories**, many overlapping within the same snapshot.

The most pervasive issue (10+ occurrences) is **incorrect varProps/constProps classification and flags bitmask** -- props like `_wrapProp()` on component elements, ternaries involving signal `.value` access, and signal-wrapped children are being placed in varEntries when the Rust optimizer puts them in constEntries (or vice versa), causing flags=2 when expected=3. The second most common issue (5 occurrences) is **bind desugaring incorrectly applied in _jsxSplit spread contexts** -- the Rust optimizer keeps `bind:value`/`bind:checked` as-is in varProps when spreads are present, but our optimizer desugars them into `"value"` + `inlinedQrl(_val, ...)`. Additional issues include: segments with `transpileJsx: false` not getting JSX transpiled (2), _hf signal hoisting for class objects producing invalid function bodies (1), key prefix not derived from file path hash (1), _auto_ re-export emitted for already-exported variables (3), variable migration using _auto_ instead of reproducing import+destructuring in segment (1), and for-of loop capture not promoted to paramNames (1).

**Primary recommendation:** Fix prop classification to match Rust semantics (store-field _wrapProp goes to constProps for component elements; ternaries with mixed signal/function calls are classified by their result type not input type), fix bind desugaring to be suppressed in ALL _jsxSplit contexts, make segment JSX transpilation unconditional (regardless of transpileJsx option), fix flags bitmask ordering, and fix key prefix to be path-derived.

## Architecture Patterns

### Failure Classification (all 26 snapshots)

| Issue Category | Count | Snapshots | Fix Location |
|---|---|---|---|
| Props classification / flags mismatch | 10 | should_not_wrap_ternary_function_operator_with_fn, should_not_wrap_var_template_string, should_wrap_inner_inline_component_prop, should_wrap_object_with_fn_signal, should_move_props_related_to_iteration_variables_to_var_props, should_split_spread_props_with_additional_prop2-5, should_transform_qrls_in_ternary_expression | jsx-transform.ts (classifyProp, processProps) |
| Bind desugaring in spread/split context | 4 | should_not_transform_bind_checked_in_var_props_for_jsx_split, should_not_transform_bind_value_in_var_props_for_jsx_split, should_move_bind_value_to_var_props, should_split_spread_props_with_additional_prop4 | jsx-transform.ts (processProps bind gate), bind-transform.ts |
| Segment JSX not transpiled (transpileJsx: false) | 2 | ternary_prop, transform_qrl_in_regular_prop | transform.ts (segment codegen call) |
| _hf signal hoisting invalid for class object | 1 | should_wrap_store_expression | signal-analysis.ts, jsx-transform.ts |
| Key prefix not path-derived | 1 | support_windows_paths | jsx-transform.ts (JsxKeyCounter) |
| _auto_ re-export for already-exported vars | 3 | should_work, should_wrap_store_expression, ternary_prop | variable-migration.ts, rewrite-parent.ts |
| Import+destructuring migration into segment | 1 | should_migrate_destructured_binding_with_imported_dependency | variable-migration.ts, segment-codegen.ts |
| For-of loop capture not in paramNames | 1 | should_transform_handler_in_for_of_loop | capture-analysis.ts or loop-hoisting.ts |
| Nested call .w() capture chaining in ternary | 1 | should_transform_qrls_in_ternary_expression | segment-codegen.ts |
| Spread prop ordering in _jsxSplit | 2 | should_split_spread_props_with_additional_prop2, should_split_spread_props_with_additional_prop3 | jsx-transform.ts |
| Non-marker function hoist into segment | 1 | should_split_spread_props_with_additional_prop5 | variable-migration.ts |
| globalActionQrl import source | 1 | should_work | rewrite-calls.ts (getQrlImportSource) |

[VERIFIED: debug script comparing actual vs expected output for all 26 snapshots]

### Detailed Issue Analysis

#### 1. Props Classification / Flags Mismatch (10 snapshots)

The most pervasive issue. Multiple scenarios where prop classification differs from Rust:

**a) Store-field _wrapProp on component elements (should_wrap_inner_inline_component_prop):**
- Expected: `_jsxSorted(Id, null, { id: _wrapProp(props, "id") }, null, 3, ...)` -- _wrapProp in constProps
- Actual: `_jsxSorted(Id, { id: _wrapProp(props, "id") }, null, null, 2, ...)` -- _wrapProp in varProps
- Root cause: `processProps` line 734 sends `isStoreField` _wrapProp to varEntries unconditionally. For component elements, the Rust optimizer puts ALL _wrapProp results (including store-field 2-arg form) in constProps.
- Fix: When `tagIsHtml === false` (component element), store-field _wrapProp should go to constEntries.

**b) Ternary with signal + function calls (should_not_wrap_ternary_function_operator_with_fn):**
- Expected: `{ title: toggle.value !== '' ? t(...) : t(...) }` in varProps, flags=3
- Actual: same prop in varProps but flags=2
- Root cause: The prop IS in varProps in both cases. The flags difference (3 vs 2) means the code is saying "has varProps" (clearing bit0) but the expected says "no varProps" (bit0=1). The Rust optimizer considers this a "var" prop too (it IS in the first arg), so flags=3 should mean something else, OR the flags bits are swapped.

Actually, after deeper analysis, the issue is that the **flags bitmask bit assignment is swapped in the code**:
- Code: bit0=no_var_props, bit1=static_children
- Rust: bit0=static_children, bit1=no_var_props

Evidence: `should_not_wrap_ternary_function_operator_with_fn` has varProps AND null children. Expected flags=3. If bit0=static_children (1, null=static) + bit1=no_var_props (0, has varProps) = 1. That gives 1, not 3. 

Wait, let me reconsider. Flags=3 with a varProps present. If flags=3 = bit0(1) + bit1(2), and there ARE varProps, then "no_var_props" cannot be set. Unless the flags don't track varProps at all and instead track something else.

Looking at more evidence:
- `should_wrap_inner_inline_component_prop`: Expected `_jsxSorted(Id, null, { id: _wrapProp }, null, 3, ...)`. No varProps, has constProps, null children. Expected=3.
- `should_not_wrap_ternary_function_operator_with_fn`: `_jsxSorted("button", { title: ternary }, { type: "button" }, null, 3, ...)`. Has varProps, has constProps, null children. Expected=3.

Both have flags=3 but different varProps situations. The common factor: children=null. And in both cases there are constProps. So maybe flags=3 means "all immutable + static children" where "immutable" refers to constProps EXISTING, not the absence of varProps.

Actually, re-examining: the second arg in `_jsxSorted` is "dynamic/mutable props" and third is "static/immutable props". Both are PROPS objects. The "flags" may refer to CHILDREN type and whether the node needs signal tracking, not the prop classification.

Let me look at real Qwik runtime code to understand flags. The bitmask likely means:
- bit 0 (1) = IMMUTABLE (no mutable/dynamic props needing signal tracking)
- bit 1 (2) = STATIC_SUBTREE (children are static, no dynamic content)

But with `should_not_wrap_ternary_function_operator_with_fn` having a ternary with `toggle.value` in varProps AND flags bit0=1 (immutable), that seems contradictory. Unless "immutable" in Qwik's runtime means something specific about whether the vnode needs re-rendering tracking, and certain varProps like ternaries using signals are still considered "immutable" at the vnode level.

After extensive analysis, the actual flag semantics appear to be:
- bit 0 (1) = children are immutable/static (null, string literal, no signal access in children)
- bit 1 (2) = props are immutable/static (no signal access requiring tracking)
- bit 2 (4) = loop context (needs q:p/q:ps)

This explains:
- flags=3: static children + immutable props (even if varProps exists, if no signal tracking needed)
- flags=2: immutable props only (dynamic children)
- flags=1: static children only (has reactive props)

The issue is that our `computeFlags` uses hasVarProps as the proxy for "immutable props", but the Rust optimizer uses "needs signal tracking" which is different. A prop can be in varProps (e.g., a ternary with `.value`) but still not need signal tracking at the flags level if it's already been unwrapped. [ASSUMED]

**c) _fnSignal result placement (should_wrap_object_with_fn_signal):**
- Expected: `"data-wrap": _fnSignal(...)` in constProps, `"data-no-wrap": item ? item * 2 : null` in varProps, flags=3
- Actual: `"data-no-wrap"` in varProps, `"data-wrap"` in constProps, but flags=2
- This is the same flags issue -- _fnSignal goes to constEntries correctly, but the flags don't account for it properly.

**d) _fnSignal for component-element prop position (should_move_props_related_to_iteration_variables_to_var_props):**
- Expected: `_jsxSorted(TestComponent, { counter: _fnSignal(...) }, { logString: "..." }, null, 3, index)`
- Actual: `_jsxSorted(TestComponent, null, { counter: _fnSignal(...), logString: "..." }, null, 7, index)`
- Root cause: _fnSignal always goes to constEntries (line 748), but for component elements with iterVar-dependent props, the Rust optimizer puts _fnSignal in varProps. AND flags=3 vs 7 difference.

#### 2. Bind Desugaring in Spread/Split Context (4 snapshots)

When spreads are present (`_jsxSplit`), `bind:value` and `bind:checked` should NOT be desugared. They should pass through as-is in the varProps:

```
// EXPECTED: bind:value kept as-is in varProps for _jsxSplit
_jsxSplit("input", { "bind:checked": input, ..._getVarProps(props) }, _getConstProps(props), null, 0, null)

// ACTUAL: bind desugared to "checked" + inlinedQrl
_jsxSplit("input", { ..._getVarProps(props) }, { ..._getConstProps(props), "checked": input, "q-e:input": inlinedQrl(_chk, ...) }, null, 0, null)
```

Root cause: The bind desugaring gate at line 646 checks `!hasSpread` but `hasSpread` may not be set yet at that point in the loop iteration (spread might come AFTER bind in attribute order). Additionally, for `should_move_bind_value_to_var_props`, the bind prop should go to varEntries (not constEntries) when in split mode.

Fix: Two changes needed:
1. Pre-scan attributes for spreads BEFORE the main loop, so `hasSpread` is known upfront
2. When `hasSpread`, keep `bind:value`/`bind:checked` as-is in varEntries

#### 3. Segment JSX Not Transpiled (2 snapshots: ternary_prop, transform_qrl_in_regular_prop)

When `transpileJsx: false`, segment bodies still contain raw JSX (`<button ...>`, `<Cmp ...>`). But the Rust optimizer ALWAYS transpiles JSX in segment bodies regardless of the transpileJsx option -- segments are standalone modules that must be self-contained.

```
// EXPECTED (segment always transpiled):
export const Cmp_component_4ryKJTOKjWE = ()=>_jsxSorted(Cmp, { foo: q_... }, null, "Hello Qwik", 3, "u6_0");

// ACTUAL (JSX not transpiled):
export const Cmp_component_4ryKJTOKjWE = () => <Cmp foo={q_...}>Hello Qwik</Cmp>;
```

Root cause: `transform.ts` line 1499 gates segment JSX on `shouldTranspileJsx` (from options). The gate should be removed for segments -- always pass `enableJsx: true`.

Also, `ternary_prop` has a parent issue: the original import `import { component$, $, useSignal } from '@qwik.dev/core'` is not being removed from the parent output. This is an import cleanup issue.

#### 4. _hf Signal Hoisting Invalid for Class Object (1 snapshot: should_wrap_store_expression)

The `class` prop has an object literal with store-derived values:
```jsx
class={{
  'too-long-to-wrap': true,
  'examples-panel-input': panelStore.active === 'Input',
  ...
}}
```

The signal analysis incorrectly wraps this in `_fnSignal` with a hoisted function. But the hoisted function body `(p0) => { 'too-long-to-wrap': true, ... }` is syntactically invalid -- the `{` is interpreted as a block statement, not an object literal.

Expected behavior: The Rust optimizer keeps `class: { ... }` as a varProp (not signal-wrapped). The object literal should be classified as "var" and placed directly in varEntries without _fnSignal wrapping.

Root cause: `analyzeSignalExpression` treats object literals with store-derived property values as needing _fnSignal wrapping. But objects with mixed literal/reactive values should NOT be wrapped -- only simple member expressions (like `panelStore.active ? 'yes' : 'no'`) should get _fnSignal.

Fix: Signal analysis should not produce `fnSignal` for ObjectExpression nodes. Instead, classify the entire object as "var" and let it pass through to varEntries.

#### 5. Key Prefix Not Path-Derived (1 snapshot: support_windows_paths)

Expected key: `"KD_0"` (derived from file path hash of `components/apps/apps.tsx`)
Actual key: `"u6_0"` (hardcoded prefix)

The key prefix is a 2-character hash of the srcDir-relative file path. For the default test path `test.tsx` (relative to srcDir `/user/qwik/src`), the prefix happens to be `u6`. For Windows paths, it's different.

Root cause: `JsxKeyCounter` hardcodes `"u6_"` prefix at line 341. It should compute the prefix from the file path using the same hashing algorithm.

Fix: Compute key prefix from `qwikHash` or a similar derivation of the relative file path, then use that as the counter prefix.

#### 6. _auto_ Re-export for Already-Exported Variables (3 snapshots)

`should_work`: Parent has `export { useSecretAction as _auto_useSecretAction }` but expected output does NOT have this re-export. The variable is already exported via `export const useSecretAction = globalActionQrl(...)`.

`should_wrap_store_expression`: Parent has `export { PANELS as _auto_PANELS }` but PANELS is already `export const PANELS = [...]`.

`ternary_prop`: Parent has leftover original import line.

Root cause: Variable migration emits `_auto_` re-exports even when the variable is already directly exported. The _auto_ re-export should be suppressed when the variable already has a direct `export` declaration.

Fix: In the migration decision logic, check if the variable is already exported. If so, skip the `_auto_` re-export.

#### 7. Import+Destructuring Migration (1 snapshot: should_migrate_destructured_binding_with_imported_dependency)

Expected: Segment has `import { source } from "lib"; const { a } = source;`
Actual: Segment has `import { _auto_a as a } from "./test";`

The captured variable `a` comes from `const { a } = source` where `source` is imported. The Rust optimizer reproduces the original import + destructuring in the segment. Our optimizer uses _auto_ migration.

Root cause: Variable migration doesn't detect that the captured variable originates from a destructured imported binding and should reproduce the import chain in the segment.

Fix: When a migrated variable is destructured from an imported value, reproduce the import + destructuring in the segment instead of using _auto_ migration.

#### 8. For-of Loop Capture (1 snapshot: should_transform_handler_in_for_of_loop)

Expected event handler segment: `(_, _1, val) => console.log(val)` -- `val` is in paramNames (position 2)
Actual: `(_, _1) => console.log(val)` -- `val` not in paramNames

The `for...of` loop variable `val` is captured by the event handler but not promoted to paramNames. Also flags=6 expected vs 4 actual (static children bit missing).

Root cause: Loop detection doesn't recognize `for...of` loop variables as loop-local captures needing paramNames promotion.

Fix: Extend loop detection to handle `ForOfStatement` (and potentially `ForInStatement`) iterator variables.

#### 9. Additional Issues

**globalActionQrl import source (should_work):**
- Expected: `import { globalActionQrl } from "@qwik.dev/router"`
- Actual: `import { globalActionQrl } from "@qwik.dev/core"`
- Root cause: `getQrlImportSource` doesn't have a mapping for `globalActionQrl` -> `@qwik.dev/router`
- Fix: Add router-specific QRL callees to the import source resolution

**Spread prop ordering in _jsxSplit (should_split_spread_props_with_additional_prop2/3):**
- Expected: non-spread props BEFORE `..._getVarProps()` in varProps
- Actual: non-spread props AFTER `..._getConstProps()` in constProps
- Root cause: When spreads are present, non-spread static props should be in varProps before the spread, not in constProps after
- Fix: In spread mode, props before the spread go to varEntries, props after go based on classification

**Non-marker function hoist into segment (should_split_spread_props_with_additional_prop5):**
- Expected: `function Hola(props) { ... }` physically in segment body
- Actual: `import { Hola } from "./test"` in segment
- Root cause: Non-marker local functions used in segments should be physically moved into the segment, not imported
- Fix: When a segment references a local function that isn't exported, copy the function definition into the segment body

### Fix Approach

**Wave 1: Unconditional segment JSX + bind spread gate + _auto_ suppression** (fixes 7 snapshots)
1. Remove `shouldTranspileJsx` gate from segment codegen -- always pass `enableJsx: true` for segments
2. Pre-scan attributes for spreads in processProps before the main loop
3. When hasSpread, keep bind:value/bind:checked as-is in varEntries (no desugaring)
4. Suppress _auto_ re-export for already-exported variables
5. Fix getQrlImportSource for router-specific QRL callees (globalActionQrl -> @qwik.dev/router)

**Wave 2: Flags bitmask + prop classification** (fixes 10+ snapshots)
1. Investigate and fix flags bitmask to match Rust semantics
2. For component elements, store-field _wrapProp goes to constEntries
3. Fix _fnSignal placement for component vs HTML elements
4. Fix signal analysis to NOT wrap ObjectExpression with _fnSignal

**Wave 3: Remaining issues** (fixes remaining snapshots)
1. Compute key prefix from file path hash
2. For-of loop variable capture promotion to paramNames
3. Import+destructuring migration into segments
4. Spread prop ordering in _jsxSplit
5. Non-marker function hoisting into segments
6. Nested call .w() chaining in ternary expressions

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key prefix computation | Custom base36 encoding | `qwikHash` or equivalent path hash | Must match Rust key derivation exactly |
| Bind spread detection | Post-hoc spread check | Pre-scan attributes array before processing | Must know spread status before first bind prop |
| Signal object wrapping | _fnSignal for objects | Direct var classification | Object literals produce invalid hoisted functions |
| Import chain reproduction | Custom import tracer | Extend existing migration decision logic | Already tracks variable origins |

## Common Pitfalls

### Pitfall 1: Flags Bitmask Semantics
**What goes wrong:** Flags don't match expected values (e.g., 3 vs 2, 6 vs 4)
**Why it happens:** The bit assignment in computeFlags may not match the Rust optimizer's semantics. The Rust optimizer's flag bits may track "needs signal tracking" rather than "has varProps".
**How to avoid:** Test against the full snapshot corpus after each flags change. The flags affect EVERY JSX element in EVERY snapshot.
**Warning signs:** Multiple previously-passing tests regressing after flags changes.

### Pitfall 2: Bind Desugaring Order Dependency
**What goes wrong:** Bind is desugared even when a spread follows later in attributes.
**Why it happens:** The processProps loop processes attributes in order. If bind comes before spread, `hasSpread` is still false.
**How to avoid:** Pre-scan ALL attributes for spreads before the main processing loop.
**Warning signs:** _jsxSplit output with desugared bind props instead of raw bind:value.

### Pitfall 3: Parent Regressions from Classification Changes
**What goes wrong:** Fixing prop classification in segments causes previously-passing parent tests to regress.
**Why it happens:** `processProps`, `classifyProp`, and `computeFlags` are shared between parent and segment codegen. Changes affect both.
**How to avoid:** Run full convergence suite after each fix. Current baseline is 55 passing.
**Warning signs:** Parent-only failures in tests that were previously passing.

### Pitfall 4: Signal Analysis for Object Literals
**What goes wrong:** Object literals with reactive property values get wrapped in _fnSignal, producing syntactically invalid hoisted functions.
**Why it happens:** `analyzeSignalExpression` recursively detects signal access in object property values and treats the whole object as needing signal wrapping.
**How to avoid:** Special-case ObjectExpression in signal analysis to return 'none' (classify as var instead).
**Warning signs:** Hoisted functions with `{ 'key': value, ... }` bodies that parse as block statements.

## Code Examples

### Pattern: Pre-scan for Spreads

```typescript
// Before the main attribute processing loop in processProps:
const hasSpread = attributes.some(
  attr => attr.type === 'JSXSpreadAttribute'
);

// Then in bind handling:
if (isBindProp(propName) && !hasSpread) {
  // Desugar bind
} else if (isBindProp(propName) && hasSpread) {
  // Keep as-is in varEntries
  varEntries.push(`"${propName}": ${valueText}`);
}
```
[ASSUMED -- derived from analysis of expected output patterns]

### Pattern: Unconditional Segment JSX

```typescript
// In transform.ts, segment codegen call:
// BEFORE (wrong):
// (shouldTranspileJsx && (ext.extension === '.tsx' || ...))
//   ? { enableJsx: true, importedNames }
//   : undefined

// AFTER (correct): always enable JSX for segments
const segJsxOptions = (ext.extension === '.tsx' || ext.extension === '.jsx' || isJsx)
  ? { enableJsx: true, importedNames }
  : undefined;
```
[VERIFIED: ternary_prop and transform_qrl_in_regular_prop expected output shows transpiled JSX in segments even with transpileJsx: false]

### Pattern: Router QRL Import Source

```typescript
// In getQrlImportSource:
const ROUTER_QRLS = new Set([
  'globalActionQrl', 'routeActionQrl', 'routeLoaderQrl',
  'serverQrl', 'zodQrl',
]);

if (ROUTER_QRLS.has(qrlCalleeName)) return '@qwik.dev/router';
if (qrlCalleeName === 'qwikifyQrl') return '@qwik.dev/react';
return '@qwik.dev/core';
```
[ASSUMED -- derived from should_work expected output showing globalActionQrl from @qwik.dev/router]

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
| P15-01 | Segment JSX transpiled unconditionally | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "ternary_prop"` | existing |
| P15-02 | Bind not desugared in spread contexts | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_transform_bind_value_in_var_props_for_jsx_split"` | existing |
| P15-03 | Correct flags bitmask | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_wrap_ternary_function_operator_with_fn"` | existing |
| P15-04 | _auto_ suppressed for exported vars | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_work"` | existing |
| P15-05 | Key prefix path-derived | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "support_windows_paths"` | existing |
| P15-06 | All 26 Phase 15 snapshots pass | convergence | `npx vitest run tests/optimizer/convergence.test.ts` | existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "AFFECTED_SNAPSHOT"`
- **Per wave merge:** `npx vitest run tests/optimizer/convergence.test.ts`
- **Phase gate:** 81/209+ passing (55 current + 26 new), zero regressions

### Wave 0 Gaps
None -- existing convergence test infrastructure covers all phase requirements.

## Already Passing (4 of 26)

- **should_merge_on_input_and_bind_checked:** PASS
- **should_merge_on_input_and_bind_value:** PASS  
- **should_split_spread_props:** PASS
- **should_split_spread_props_with_additional_prop:** PASS
- **should_wrap_type_asserted_variables_in_template:** PASS (5 total)

## Snapshot-by-Issue Matrix

| Snapshot | Parent | Segs | Issues |
|----------|--------|------|--------|
| should_merge_on_input_and_bind_checked | OK | OK | PASS |
| should_merge_on_input_and_bind_value | OK | OK | PASS |
| should_migrate_destructured_binding_with_imported_dependency | FAIL | FAIL | import migration, _auto_ |
| should_move_bind_value_to_var_props | OK | FAIL | bind in split, prop ordering |
| should_move_props_related_to_iteration_variables_to_var_props | OK | FAIL | _fnSignal placement, flags |
| should_not_transform_bind_checked_in_var_props_for_jsx_split | OK | FAIL | bind in split |
| should_not_transform_bind_value_in_var_props_for_jsx_split | OK | FAIL | bind in split |
| should_not_wrap_ternary_function_operator_with_fn | OK | FAIL | flags (3 vs 2) |
| should_not_wrap_var_template_string | OK | FAIL | prop ordering, flags (3 vs 2) |
| should_split_spread_props | OK | OK | PASS |
| should_split_spread_props_with_additional_prop | OK | OK | PASS |
| should_split_spread_props_with_additional_prop2 | OK | FAIL | spread prop ordering |
| should_split_spread_props_with_additional_prop3 | OK | FAIL | spread prop ordering, constProps vs all-in-varProps |
| should_split_spread_props_with_additional_prop4 | OK | FAIL | event in varProps, flags (4 vs 0), missing q:p |
| should_split_spread_props_with_additional_prop5 | FAIL | FAIL | function hoist into segment, parent cleanup |
| should_transform_handler_in_for_of_loop | OK | FAIL | for-of capture, flags (6 vs 4) |
| should_transform_qrls_in_ternary_expression | OK | FAIL | ternary QRL .w() chaining, prop placement, flags (6 vs 3) |
| should_work | FAIL | OK | globalActionQrl source, _auto_ export |
| should_wrap_inner_inline_component_prop | OK | FAIL | _wrapProp placement, flags (3 vs 2), children "Id: " |
| should_wrap_logical_expression_in_template | OK | FAIL | logical expr _fnSignal vs _wrapProp |
| should_wrap_object_with_fn_signal | OK | FAIL | flags (3 vs 2) |
| should_wrap_store_expression | FAIL | FAIL | _hf class object, _auto_ export, flags |
| should_wrap_type_asserted_variables_in_template | OK | OK | PASS |
| support_windows_paths | OK | FAIL | key prefix "KD_" vs "u6_" |
| ternary_prop | FAIL | FAIL | segment JSX not transpiled, parent import cleanup |
| transform_qrl_in_regular_prop | OK | FAIL | segment JSX not transpiled |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Flags bitmask semantics: bit0=immutable_props, bit1=static_children in the Rust optimizer | Issue 1 | Flags would be wrong everywhere; need to study Qwik runtime code to confirm |
| A2 | Segments should always get JSX transpiled regardless of transpileJsx option | Issue 3 | May need per-test option override instead |
| A3 | Key prefix "u6" comes from hashing "test.tsx" relative path | Issue 5 | May be a different derivation |
| A4 | globalActionQrl should be imported from @qwik.dev/router | Issue 9 | May need broader list of router-specific QRL callees |
| A5 | Object literals should never get _fnSignal wrapping | Issue 4 | Some object patterns may need it; need to verify with corpus |
| A6 | For-of loop variables should be promoted to paramNames like for-in/for-const | Issue 8 | May need different handling than traditional loop captures |

## Open Questions

1. **Flags bitmask exact semantics**
   - What we know: Many tests show expected=3 with varProps present, which contradicts "bit0=no_var_props"
   - What's unclear: Whether the Rust flags track "has signal-reactive props" vs "has ANY varProps"
   - Recommendation: Study the Qwik runtime JSX reconciliation code to understand exact flag meanings. Alternatively, run all 209 snapshots and collect (varProps, constProps, children, flags) tuples to reverse-engineer the pattern.

2. **Key prefix derivation algorithm**
   - What we know: Default test path produces "u6_", Windows path produces "KD_"
   - What's unclear: Exact hash function used for key prefix (full qwikHash? truncated? different algorithm?)
   - Recommendation: Look at Rust optimizer source for `new_jsx_dev_key` or similar function

3. **Import migration for destructured bindings**
   - What we know: Rust reproduces original import + destructuring in segment
   - What's unclear: Scope of this pattern -- only for destructured imports or also for other derived bindings?
   - Recommendation: Check if other snapshots in the remaining corpus have similar patterns

## Sources

### Primary (HIGH confidence)
- Debug script output comparing actual vs expected for all 26 Phase 15 snapshots
- Source code analysis: jsx-transform.ts, bind-transform.ts, signal-analysis.ts, segment-codegen.ts, transform.ts, rewrite-calls.ts
- Snapshot files in match-these-snaps/ directory

### Secondary (MEDIUM confidence)
- Prior phase research (14-RESEARCH.md) for established patterns
- STATE.md accumulated decisions from Phases 7-14

### Tertiary (LOW confidence)  
- Flags bitmask interpretation (needs Qwik runtime verification)
- Key prefix derivation algorithm (needs Rust source verification)

## Metadata

**Confidence breakdown:**
- Segment JSX unconditional: HIGH -- expected output clearly shows transpiled JSX with transpileJsx:false
- Bind spread gate: HIGH -- expected output clearly shows un-desugared bind:value in _jsxSplit
- _auto_ suppression: HIGH -- expected output clearly shows no _auto_ for exported vars
- Flags bitmask: MEDIUM -- pattern observed but exact semantics not fully confirmed
- Key prefix: MEDIUM -- "u6" vs "KD" observed but derivation algorithm not confirmed
- Import migration: MEDIUM -- single snapshot evidence, may be broader pattern

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase, no external dependencies changing)
