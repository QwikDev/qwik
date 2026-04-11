# Phase 19: JSX Transform Convergence - Research

**Researched:** 2026-04-11
**Domain:** JSX transform (_jsxSorted/_jsxSplit flags, prop classification, signal wrapping)
**Confidence:** HIGH

## Summary

Phase 19 addresses JSX transform mismatches between the TS optimizer and SWC reference output. Through detailed analysis of the SWC reference source (`swc-reference-only/transform.rs`) and failing convergence snapshots, I identified **four root cause categories** that produce the 136 failing tests:

1. **Flags bitmask bits are swapped** -- The TS optimizer has bit 0 = children static, bit 1 = no var props. SWC has bit 0 = `static_listeners` (all props const), bit 1 = `static_subtree` (children not mutable). This affects virtually every JSX element's flags value.

2. **Prop classification diverges from SWC `is_const` semantics** -- SWC treats ALL member expressions and ALL function calls as var (not const). The TS `classifyProp` is more nuanced but produces different results. Additionally, SWC's component vs HTML element classification logic differs: components default to var_props, HTML elements default to const_props.

3. **Missing `_createElement` fallback for spread+key** -- SWC uses `_createElement` (imported as `createElement` from `@qwik.dev/core`) when a JSX element has both spread props AND an explicit key. The TS optimizer always uses `_jsxSplit` which cannot handle key extraction from spread props.

4. **Signal wrapping placement in children** -- The `_wrapProp` and `_fnSignal` calls must match SWC's `convert_to_signal_item` behavior in children processing. The `jsx_mutable` flag tracking in SWC is stateful and propagates through nested JSX, affecting `static_subtree` (flags bit 1).

**Primary recommendation:** Fix the flags bitmask order first (highest blast radius), then align prop classification with SWC `is_const` semantics, then handle `_createElement` fallback, then fix signal wrapping edge cases.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JSXR-01 | Flags bitmask values in `_jsxSorted`/`_jsxC` calls match snapshot expected values | Root cause #1: bits are swapped. SWC: bit 0 = static_listeners, bit 1 = static_subtree, bit 2 = moved_captures. Fix `computeFlags` to match. |
| JSXR-02 | Prop classification (var vs const buckets) produces AST-matching `_jsxSorted` calls | Root cause #2: SWC `is_const` treats all member expressions and function calls as var. Component vs HTML element classification logic differs. Align `classifyProp` and `processProps` routing. |
| JSXR-03 | `_jsxSplit` generation for spread props matches snapshot expected output | Root cause #3: Missing `_createElement` fallback for spread+key pattern. Also need to verify `_getVarProps`/`_getConstProps` placement matches SWC `handle_jsx_props_obj_spread`. |
| JSXR-04 | Signal wrapping (`_wrapProp`/`_fnSignal`) placement produces AST-matching segment and parent output | Root cause #4: Signal wrapping in children expressions and stateful `jsx_mutable` tracking affect flags. Fix `processChildren` to align with SWC `convert_children`/`convert_to_signal_item`. |
</phase_requirements>

## Architecture Patterns

### Root Cause #1: Flags Bitmask Order (JSXR-01)

**SWC behavior** (from `swc-reference-only/transform.rs` lines 2644-2653): [VERIFIED: swc-reference-only/transform.rs]

```rust
let mut flags = 0;
if static_listeners {    // bit 0 (value 1): ALL props are const
    flags |= 1 << 0;
}
if static_subtree {      // bit 1 (value 2): children are not mutable
    flags |= 1 << 1;
}
if moved_captures {      // bit 2 (value 4): captures moved (loop/q:p context)
    flags |= 1 << 2;
}
```

**Current TS code** (`src/optimizer/jsx-transform.ts` lines 313-326):

```typescript
// WRONG: bits are swapped from SWC
if (!inLoop || !hasVarProps) { flags |= 1; }  // bit 0: always set outside loop (WRONG)
if (childrenType !== 'dynamic') { flags |= 2; } // bit 1: children static
if (inLoop) { flags |= 4; }                     // bit 2: loop context
```

**Fix required:** Swap bit 0 and bit 1 to match SWC:
- Bit 0 (value 1): `static_listeners` -- set when ALL props are const (no var props at all)
- Bit 1 (value 2): `static_subtree` -- set when children are static/none
- Bit 2 (value 4): `moved_captures` -- set when captures are moved (loop/q:p context)

**Impact of fix:** This single change affects the flags of every JSX element in the output. Expected snapshot values like `3` (static props + static children), `1` (static props, dynamic children), `2` (var props, static children), `0` (spread) will now match.

**SWC `static_listeners` semantics** [VERIFIED: swc-reference-only/transform.rs lines 2218, 2442, 2514]:
- Starts `true` (assuming all props are const)
- Set to `false` when: (a) a non-const regular prop is found (`!const_prop`), (b) a non-const event handler QRL is found (`!is_const`), (c) spread props exist (`!has_spread_props` in initialization)

**SWC `static_subtree` semantics** [VERIFIED: swc-reference-only/transform.rs lines 2219, 2381]:
- Starts `true`
- Set to `false` when `self.jsx_mutable` is true after processing children
- `jsx_mutable` becomes true when: children contain identifiers not in `immutable_function_cmp`, function calls not in `jsx_functions`, non-const expressions, or tagged templates

### Root Cause #2: Prop Classification (JSXR-02)

**SWC `is_const` rules** (from `swc-reference-only/is_const.rs`): [VERIFIED: swc-reference-only/is_const.rs]

A prop is `const` only if it contains NO:
- Function calls (ANY `CallExpr` makes it var)
- Member expressions (ANY `MemberExpr` makes it var)
- Identifiers that are not imports, not exports, and not in const stack

**Current TS `classifyProp` divergence** (from `src/optimizer/jsx-transform.ts` lines 92-263):
- Allows member expressions on imported objects as const (e.g., `styles.foo` classified as const)
- Allows some function calls as const (e.g., `_wrapProp(...)` and `_fnSignal(...)`)
- Has special logic for template literals, ternary, etc.

**The key insight:** SWC's `is_const` is much stricter (member expressions and calls are ALWAYS var), BUT signal wrapping transforms happen BEFORE `is_const` classification. So `_wrapProp(signal)` is already the transformed form when `is_const` sees it -- and `is_const` classifies it as var (it's a call!). However, in SWC the transformed signal goes to const_props regardless of `is_const` result because signal transforms have their own routing logic.

**SWC's prop routing logic** (from `swc-reference-only/transform.rs` lines 3328-3344): [VERIFIED: swc-reference-only/transform.rs]

For HTML elements (`!is_fn`):
```
if !is_const || spread_props_count > 0 -> var_props
else -> const_props
```

For component elements (`is_fn`):
```
if is_const && spread_props_count == 0 -> const_props
else -> var_props
```

Components have the opposite default: props go to var by default, only explicitly const props go to const. HTML elements: props go to const by default, only var props go to var.

**Fix required:** Align `classifyProp` with SWC's stricter `is_const` semantics AND ensure the routing logic between var/const props matches the is_fn/!is_fn divergence. The signal-analyzed props (_wrapProp, _fnSignal) have separate routing that already partially matches but needs verification.

### Root Cause #3: _createElement Fallback (JSXR-03)

**SWC behavior:** When a JSX element has both spread props AND an explicit `key` attribute, SWC does NOT use `_jsxSplit`. Instead it falls back to `createElement` (imported as `createElement as _createElement` from `@qwik.dev/core`). [VERIFIED: example_spread_jsx snapshot]

**Evidence from `example_spread_jsx` snapshot:**
```javascript
head.links.map((l)=> _createElement("link", {...l, key: l.key}))
head.styles.map((s)=> _createElement("style", {...s.props, dangerouslySetInnerHTML: s.style, key: s.key}))
```

But for spread WITHOUT key:
```javascript
head.meta.map((m)=> _jsxSplit("meta", {..._getVarProps(m)}, _getConstProps(m), null, 0, "u6_0"))
```

**Current TS behavior:** Always uses `_jsxSplit` for spread props, ignoring the key. This produces wrong output for spread+key cases.

**Fix required:** Detect spread+key co-occurrence and emit `_createElement(tag, {...spread, key: keyExpr, ...otherProps})` instead of `_jsxSplit`. Import `createElement as _createElement` from `@qwik.dev/core`.

### Root Cause #4: Signal Wrapping in Children (JSXR-04)

**SWC behavior** (from `swc-reference-only/transform.rs` `convert_children` and `convert_to_signal_item`): [VERIFIED: swc-reference-only/transform.rs lines 2744-2953]

1. For single child expressions that are NOT calls and NOT const: `create_synthetic_qqsegment` is called, which may produce `_wrapProp(obj, "field")` for `obj.field` patterns or `_fnSignal(...)` for computed expressions.
2. For function calls: if the callee is NOT a jsx_function, `jsx_mutable = true` (marking children as dynamic).
3. For arrays: each element is processed through `convert_to_signal_item`.

**Current TS behavior** (`src/optimizer/jsx-transform.ts` `processChildren`):
- Signal analysis in children already exists via `analyzeSignalExpression`
- Children classification returns 'static' or 'dynamic' but doesn't have SWC's nuanced `jsx_mutable` tracking

**Key difference:** SWC's `_wrapProp` result for a child expression is treated as const (doesn't set `jsx_mutable`), so children that are ONLY `_wrapProp` calls still count as `static_subtree`. Example from `example_mutable_children` snapshot: `_wrapProp(props)` in children produces flags=1 (static_listeners=true but the wrapping itself implies it's part of children that... actually wait, flags=1 means bit 0 set = static_listeners).

Looking at `example_mutable_children` snapshot more carefully:
- `_jsxSorted("div", null, null, [\"Static \", _wrapProp(props)], 1, null)` -- flags=1 means static_listeners (bit 0) but NOT static_subtree (bit 1). This makes sense: `_wrapProp(props)` is a function call, so `jsx_mutable = true`, so `static_subtree = false`. No var props, so `static_listeners = true`.
- `_jsxSorted("div", null, null, \"Static\", 3, null)` -- flags=3 means both bits set (pure string child, no var props).

**Fix required:** Align children type classification with SWC's `jsx_mutable` semantics. Function calls in children (including `_wrapProp`, `_fnSignal`) should make children dynamic (bit 1 = 0). Component tag identifiers not in `immutable_function_cmp` set should make children dynamic.

### SWC Prop Sorting

**SWC sorts var_props alphabetically when `should_runtime_sort` is false** (lines 2654-2678). [VERIFIED: swc-reference-only/transform.rs]

`should_runtime_sort = has_spread_props || has_component_bind_props`

When not runtime-sorted, var_props entries are sorted by key name alphabetically. This affects the order of props in the output. The TS optimizer may need to match this ordering.

### SWC `immutable_function_cmp` Set

**Used to skip `jsx_mutable = true` for known immutable component tags** [VERIFIED: swc-reference-only/transform.rs lines 245-273]:
- `Fragment` from `@qwik.dev/core/jsx-runtime` or `@qwik.dev/core`
- `RenderOnce` from `@qwik.dev/core`
- `Link` from `@qwik.dev/router`
- Any import from a source ending in `?jsx` or `.md`

When a component identifier NOT in this set is used as a JSX tag, `jsx_mutable = true` is set, making that element's children dynamic for the parent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prop constness check | Custom rules for each expression type | Align with SWC's simple `is_const` (no calls, no members, no non-import idents) | SWC's rules are simpler and produce matching output |
| Spread+key detection | Complex _jsxSplit key handling | _createElement fallback | SWC uses this pattern; simpler than trying to extract key from spread |

## Common Pitfalls

### Pitfall 1: Flags Swap Causes Cascading Mismatches
**What goes wrong:** Swapping flag bits without understanding the full semantics causes tests that check for specific flag values (like flags=1, flags=3) to all break simultaneously.
**Why it happens:** The bits control different runtime behaviors and many snapshots encode specific flag values.
**How to avoid:** Fix `computeFlags` parameters to match SWC semantics exactly. Test with a few key snapshots (example_mutable_children, example_derived_signals_div) before running full suite.
**Warning signs:** If flags=3 snapshots show flags=3 after the fix, the swap is correct. If they show other values, the semantics are wrong.

### Pitfall 2: classifyProp Changes Cause Prop Bucket Regressions
**What goes wrong:** Making `classifyProp` stricter (to match SWC's `is_const`) moves props between var/const buckets, potentially breaking previously-passing tests.
**Why it happens:** Signal-analyzed props (_wrapProp, _fnSignal) have their own routing that bypasses `classifyProp`. Changing `classifyProp` only affects the fallback path.
**How to avoid:** Keep signal analysis routing unchanged. Only modify the non-signal fallback classification. Run regression checks after each change.
**Warning signs:** Previously-passing immutable_analysis-type tests start failing.

### Pitfall 3: Children Type vs jsx_mutable Semantics
**What goes wrong:** Children that contain `_wrapProp` or `_fnSignal` calls are incorrectly classified as "static" because the signal analysis "handled" them.
**Why it happens:** In SWC, `_wrapProp()` in children is STILL a function call, so `jsx_mutable = true`. The current TS code might classify signal-wrapped children as 'static'.
**How to avoid:** After signal wrapping in children, still classify as 'dynamic' if the result is a function call. Only literal values and identifiers (from imports) remain static.
**Warning signs:** flags off by 2 (bit 1 is wrong) on elements with signal-wrapped children.

### Pitfall 4: Component vs HTML Element Prop Routing
**What goes wrong:** Props for component elements go to wrong bucket because the routing logic doesn't differentiate between `is_fn` (component) and `!is_fn` (HTML).
**Why it happens:** SWC has opposite defaults: component props default to var, HTML props default to const.
**How to avoid:** Check `tagIsHtml` consistently in prop routing and match SWC's is_fn logic.
**Warning signs:** Component-heavy snapshots (example_functional_component_2) have props in wrong buckets.

## Code Examples

### Corrected computeFlags

```typescript
// Source: swc-reference-only/transform.rs lines 2644-2653
export function computeFlags(
  hasVarProps: boolean,
  childrenStatic: boolean,
  movedCaptures: boolean = false,
): number {
  let flags = 0;
  // Bit 0 (value 1): static_listeners -- all props are const
  if (!hasVarProps) {
    flags |= 1;
  }
  // Bit 1 (value 2): static_subtree -- children are static
  if (childrenStatic) {
    flags |= 2;
  }
  // Bit 2 (value 4): moved_captures -- captures moved via q:p/q:ps
  if (movedCaptures) {
    flags |= 4;
  }
  return flags;
}
```

### createElement Fallback for Spread+Key

```typescript
// When spread and explicit key co-exist, use _createElement instead of _jsxSplit
// Source: example_spread_jsx snapshot output
if (hasSpread && explicitKey !== null) {
  neededImports.add('createElement');
  // Merge all props into a single object: {...spread, key: keyExpr, ...other}
  const propsEntries = [...allEntries];
  propsEntries.push(`key: ${explicitKey}`);
  const callString = `_createElement(${tag}, { ...${spreadArg}, ${propsEntries.join(', ')} })`;
  // ...
}
```

### SWC-aligned is_const Check

```typescript
// Source: swc-reference-only/is_const.rs
// A prop is const only if it has NO function calls, NO member expressions,
// and NO identifiers that aren't imports/exports/const-stack
function isConstExpr(node: any, importedNames: Set<string>): boolean {
  if (!node) return true;
  switch (node.type) {
    case 'CallExpression': return false;  // ALL calls are var
    case 'MemberExpression': return false; // ALL member access is var
    case 'Identifier':
      return importedNames.has(node.name); // Only imports are const
    case 'Literal':
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return true;
    case 'TemplateLiteral':
      return node.expressions?.every((e: any) => isConstExpr(e, importedNames)) ?? true;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true; // Functions are values, treated as const
    case 'ObjectExpression':
      return node.properties?.every((p: any) =>
        p.type === 'SpreadElement'
          ? isConstExpr(p.argument, importedNames)
          : isConstExpr(p.value, importedNames)
      ) ?? true;
    case 'ArrayExpression':
      return node.elements?.every((e: any) =>
        e === null || (e.type === 'SpreadElement'
          ? isConstExpr(e.argument, importedNames)
          : isConstExpr(e, importedNames))
      ) ?? true;
    case 'ConditionalExpression':
      return isConstExpr(node.test, importedNames)
        && isConstExpr(node.consequent, importedNames)
        && isConstExpr(node.alternate, importedNames);
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isConstExpr(node.left, importedNames)
        && isConstExpr(node.right, importedNames);
    case 'UnaryExpression':
      return isConstExpr(node.argument, importedNames);
    default:
      return false;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bit 0 = children, bit 1 = props | Bit 0 = props, bit 1 = children (SWC) | Phase 19 | All flags values change to match SWC |
| Lenient classifyProp | Strict is_const matching SWC | Phase 19 | Some props move between var/const buckets |
| Always _jsxSplit for spread | _createElement for spread+key | Phase 19 | Correct output for ~5 spread+key snapshots |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (or package.json scripts) |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JSXR-01 | Flags bitmask values match snapshots | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_mutable_children"` | Yes |
| JSXR-02 | Prop classification matches snapshots | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_immutable_analysis"` | Yes |
| JSXR-03 | _jsxSplit / _createElement matches snapshots | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_spread_jsx"` | Yes |
| JSXR-04 | Signal wrapping placement matches snapshots | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_derived_signals_div"` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts` (convergence only, ~1s)
- **Per wave merge:** `npx vitest run` (full suite, ~2s)
- **Phase gate:** Full suite green before verification; convergence count >= 74 (zero regressions)

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements via convergence snapshots.

## Key Failing Snapshot Categories

Based on analysis of 136 failing convergence tests, categorized by primary root cause:

### Category A: Flags Mismatch (affects ~80% of failing JSX tests)
Every JSX element has the wrong flags due to bit swap. Snapshots: `example_mutable_children`, `example_derived_signals_*`, `example_jsx`, `example_jsx_listeners`, `moves_captures_when_possible`, `should_transform_handler_in_for_of_loop`, and many more.

### Category B: Prop Bucket Mismatch (affects ~30% of failing JSX tests)
Props landing in wrong var/const bucket. Snapshots: `example_immutable_analysis`, `example_props_optimization`, `example_props_wrapping*`, `should_mark_props_as_var_props_for_inner_cmp`.

### Category C: Spread/createElement (affects ~10 tests)
Missing _createElement for spread+key. Snapshots: `example_spread_jsx`, `should_split_spread_props_with_additional_prop*`, `should_merge_attributes_with_spread_props*`, `should_not_transform_bind_*_for_jsx_split`.

### Category D: Signal Wrapping (affects ~15 tests)
_wrapProp/_fnSignal placement or children dynamic classification. Snapshots: `example_derived_signals_*`, `should_wrap_*`, `lib_mode_fn_signal`, `example_getter_generation`.

### Category E: Non-JSX Issues (pre-existing, not Phase 19 scope)
Variable migration, _qrlSync, capture delivery. Snapshots: `example_segment_variable_migration`, `example_of_synchronous_qrl`, `example_multi_capture`, etc. These belong to Phase 20.

Note: Categories overlap -- many tests fail for multiple reasons. Fixing Category A (flags) alone should unlock significant convergence improvement.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Fixing flags bitmask swap alone will flip many tests from fail to pass | Key Failing Snapshot Categories | If other issues dominate, flags fix alone won't show improvement; but it's still a prerequisite |
| A2 | `_createElement` is the correct import name for spread+key fallback | Root Cause #3 | The import might need to be `createElement` aliased to `_createElement` per snapshot evidence |

## Open Questions

1. **How many tests will flip from fix-by-fix?**
   - What we know: Flags mismatch affects virtually all JSX tests. Prop classification and signal wrapping affect smaller subsets.
   - What's unclear: The exact count of tests that will pass after each individual fix
   - Recommendation: Fix flags first, measure, then tackle prop classification

2. **Component prop routing for non-HTML tags**
   - What we know: SWC routes component props to var_props by default (opposite of HTML)
   - What's unclear: Whether the current TS code already handles this via `tagIsHtml` checks in processProps
   - Recommendation: Verify with `should_mark_props_as_var_props_for_inner_cmp` snapshot

3. **var_props alphabetical sorting**
   - What we know: SWC sorts var_props alphabetically when no spread
   - What's unclear: Whether the current TS code already sorts or if this needs adding
   - Recommendation: Check if prop order mismatches exist in failing tests; add sorting if needed

## Sources

### Primary (HIGH confidence)
- `swc-reference-only/transform.rs` lines 2644-2653 -- flags bitmask computation
- `swc-reference-only/transform.rs` lines 2218-2219 -- static_listeners/static_subtree initialization
- `swc-reference-only/transform.rs` lines 3301-3345 -- add_prop_to_appropriate_list routing
- `swc-reference-only/is_const.rs` -- complete is_const implementation
- `swc-reference-only/transform.rs` lines 2744-2953 -- convert_children and convert_to_signal_item
- `swc-reference-only/transform.rs` lines 245-273 -- immutable_function_cmp set
- `match-these-snaps/qwik_core__test__example_mutable_children.snap` -- flags evidence
- `match-these-snaps/qwik_core__test__example_derived_signals_div.snap` -- signal wrapping evidence
- `match-these-snaps/qwik_core__test__example_spread_jsx.snap` -- _createElement evidence

### Secondary (MEDIUM confidence)
- `src/optimizer/jsx-transform.ts` -- current implementation review

## Metadata

**Confidence breakdown:**
- Flags bitmask: HIGH -- directly verified from SWC source and snapshot evidence
- Prop classification: HIGH -- is_const.rs and transform.rs routing verified
- _createElement fallback: HIGH -- verified from snapshot output
- Signal wrapping: MEDIUM -- SWC logic is complex with stateful jsx_mutable tracking; edge cases may surface

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable domain, SWC reference is fixed)
