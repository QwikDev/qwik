# Phase 12: Segment Identity Batch 3 - Research

**Researched:** 2026-04-10
**Domain:** Loop variable handling, event handler parameter injection, .w() capture hoisting, JSX prop placement
**Confidence:** HIGH

## Summary

Phase 12 covers the final 21 segment-identity snapshots. Despite the phase name suggesting "identity" issues (wrong names/hashes), diagnostic analysis reveals that all 21 snapshots already produce segments with **correct names, hashes, displayNames, and canonicalFilenames**. The failures are entirely in **segment code generation** and **captures metadata** -- specifically around how event handlers inside loops receive their loop iteration variables.

The core problem is three-fold: (1) event handler segments inside loops are not receiving loop variable parameters via the `(_, _1, loopVar)` signature -- they still have the original `() =>` signature; (2) the parent segment body does not generate `.w([captures])` hoisting declarations for cross-scope captures in nested loops; (3) the `q:p`/`q:ps` prop placement and the captures metadata flag are inconsistent with the Rust optimizer's output.

**Primary recommendation:** Implement loop-aware segment codegen that: (a) rewrites event handler segment signatures to include `(_, _1, ...loopVars)` padding, (b) generates `.w([captures])` hoisting inside the parent segment body for cross-loop-scope captures, and (c) correctly partitions loop-local variables (delivered via q:p as params) from outer-scope captures (delivered via ._captures).

## Failure Classification

All 21 Phase 12 snapshots were analyzed with a diagnostic script. Here is the precise breakdown:

### Category 1: Loop Variable Parameter Injection (15 snapshots)

Event handlers inside `.map()` loops need their captured loop iteration variables delivered as positional parameters: `(_, _1, loopVar)`. Currently the optimizer emits `() => body` with the loop variable still as a free reference.

**Pattern (Expected):**
```javascript
// Segment: event handler receives loop var as 3rd+ param
export const handler_name = (_, _1, index) => console.log(index);
```

**Pattern (Actual - broken):**
```javascript
// Loop var is a dangling reference -- not a formal parameter
export const handler_name = () => console.log(index);
```

**Affected snapshots:**
- should_transform_block_scoped_variables_in_loop
- should_transform_block_scoped_variables_and_item_index_in_loop
- should_transform_multiple_block_scoped_variables_in_loop
- should_transform_multiple_block_scoped_variables_and_item_index_in_loop
- should_transform_nested_loops
- should_transform_nested_loops_handler_captures_only_inner_scope
- should_transform_handlers_capturing_cross_scope_in_nested_loops
- should_transform_three_nested_loops_handler_captures_outer_only
- should_transform_loop_multiple_handler_with_different_captures
- should_transform_same_element_one_handler_with_captures_one_without
- should_transform_two_handlers_capturing_different_block_scope_in_loop
- should_transform_multiple_event_handlers (loops with events)
- should_transform_multiple_event_handlers_case2
- should_transform_component_with_normal_function
- should_wrap_prop_from_destructured_array

### Category 2: .w() Capture Hoisting in Parent Segment Body (6 snapshots)

When an event handler inside a nested loop captures a variable from an **outer** loop scope, the Rust optimizer generates a `.w([outerVar])` hoisting declaration inside the parent segment's body. The current TS optimizer does not do this.

**Pattern (Expected in parent segment body):**
```javascript
export const parent_segment = function() {
  // ...
  return _jsxSorted("div", null, null, data.value.map((row) => {
    // .w() hoisted BEFORE inner loop, capturing outer-scope variable
    const inner_handler = q_inner_handler.w([row]);
    return _jsxSorted("div", {
      "q-e:click": q_outer_handler,
      "q:p": row
    }, null, data2.value.map((item) => _jsxSorted("p", {
      "q-e:click": inner_handler,  // uses hoisted .w() variable
      "q:p": item
    }, null, /* ... */)), 4, "u6_1");
  }), 1, "u6_2");
};
```

**Pattern (Actual - broken):**
```javascript
// No .w() hoisting; inner handler QRL ref used directly without capture binding
```

**Affected snapshots (subset with cross-scope captures):**
- should_transform_nested_loops (captures=true for inner handler)
- should_transform_handlers_capturing_cross_scope_in_nested_loops
- should_transform_three_nested_loops_handler_captures_outer_only
- should_not_wrap_fn (captures metadata wrong)
- should_wrap_prop_from_destructured_array (captures metadata wrong)

### Category 3: Captures Metadata Flag Mismatches (5 snapshots)

The `captures` boolean in segment metadata is wrong -- either `true` when it should be `false` (because the variable is delivered via loop params) or `false` when it should be `true` (because the variable crosses a loop scope boundary and needs `.w()`).

| Snapshot | Segment | Got | Expected |
|----------|---------|-----|----------|
| should_not_wrap_fn | button_q_e_click | true | false |
| should_transform_nested_loops | p_q_e_click | false | true |
| should_transform_handlers_cross_scope | button_q_e_click | false | true |
| should_transform_handlers_cross_scope | span_q_e_keydown | false | true |
| should_transform_three_nested_loops | button_q_e_click | false | true |
| should_wrap_prop_from_destructured_array | button_q_e_click | true | false |

### Category 4: Parent Module Codegen (6 snapshots)

These have parent module AST mismatches alongside segment issues. The parent issues are related to loop prop placement (q:p going into wrong arg slot) and .w() hoisting not appearing in the parent body.

**Affected:** should_ignore_preventdefault_with_passive, should_only_disable_the_next_line, should_transform_component_with_normal_function, should_transform_multiple_event_handlers, should_transform_multiple_event_handlers_case2, should_transform_nested_loops

### Category 5: Non-loop Issues (3 snapshots)

- **should_not_transform_events_on_non_elements**: Component elements (uppercase tag) keep untransformed event names -- segment body JSX codegen issue
- **should_transform_event_names_without_jsx_transpile**: transpileJsx=false mode segment body issue
- **should_transform_passive_event_names_without_jsx_transpile**: Same as above for passive events

## Architecture Patterns

### Pattern 1: Loop Variable to Parameter Promotion

The Rust optimizer classifies captured variables into two categories:
1. **Loop-local variables** (declared inside the loop body or as loop iteration params): These become positional parameters via `(_, _1, var)` with `q:p: var` or `q:ps: [var1, var2]` on the JSX element.
2. **Cross-scope captures** (declared in an outer loop but referenced in an inner loop handler): These use `_captures` mechanism with `.w([var])` hoisting.

**Key rule:** If a variable is available as a loop iteration variable at the JSX element level, it goes via `q:p` (parameter injection). If it crosses a loop boundary (outer loop var used in inner loop handler), it needs `.w()` hoisting.

### Pattern 2: _captures vs Parameter Delivery

```
Variable in handler body:
  |
  +-- Declared in SAME loop scope as JSX element?
  |     YES -> Delivered via q:p / q:ps -> paramNames: [_, _1, var]
  |            captures: false
  |
  +-- Declared in OUTER loop scope?
  |     YES -> Delivered via .w([var]) + _captures
  |            captures: true, captureNames: [var]
  |            Parent body has: const handler = q_handler.w([outerVar])
  |
  +-- Declared in component scope (non-loop)?
        -> Delivered via q:p (single) -> paramNames: [_, _1, var]
           captures: false
```

### Pattern 3: Segment Signature Rewriting

Current segment codegen emits the raw `bodyText` from extraction. For loop-context event handlers, the signature must be rewritten:

```javascript
// Original bodyText: () => console.log(index)
// Required output:   (_, _1, index) => console.log(index)
```

The `paramNames` field already exists on extractions but is not being used to rewrite the segment's function signature. The codegen needs to inject the padding parameters.

### Pattern 4: q:p Prop Placement in JSX

The expected output shows `q:p` goes into the **varEntries** (second arg of _jsxSorted) for some cases and **constEntries** (third arg) for others:

- **HTML element with event handler capturing loop var**: `q:p` in varEntries (2nd arg)
  ```javascript
  _jsxSorted("button", {"q:p": currentType}, {"q-e:click": q_handler}, ...)
  ```
- **HTML element inside loop without captures**: `q:p` in constEntries (3rd arg)
  ```javascript
  _jsxSorted("div", {"q-e:click": q_handler, "q:p": index}, null, ...)
  ```

The current code puts `q:p` in constEntries always. The Rust optimizer places `q:p` in varEntries when the handler has captures that need `.w()`.

### Pattern 5: Hoisted Signal Deduplication

In the `should_transform_nested_loops` snapshot, the same `_hf0` function is reused for different signal paths when the expression is identical:
```javascript
const _hf0 = (p0) => p0.value.id;
const _hf0_str = "p0.value.id";
// Used for BOTH row.value.id and item.value.id since the accessor pattern is the same
```

The current TS optimizer generates separate `_hf0` and `_hf1` for identical expressions. This needs deduplication.

### Anti-Patterns to Avoid

- **Treating all captured variables the same**: Loop-local vars and cross-scope captures have fundamentally different delivery mechanisms (params vs _captures).
- **Modifying segment body text without parameter injection**: The segment codegen must rewrite the function signature, not just the body.
- **Putting q:p always in constEntries**: The placement depends on whether the handler has captures.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loop scope detection | Custom scope walking | Existing `findEnclosingLoop` + `detectLoopContext` in loop-hoisting.ts | Already handles all loop types |
| Capture classification | New capture analysis | Extend existing `analyzeCaptures` in capture-analysis.ts | Add loop-awareness to existing pipeline |
| Parameter injection | String regex on body | Parse-based signature rewriting in segment-codegen.ts | Regex breaks on edge cases |

## Common Pitfalls

### Pitfall 1: Block-Scoped Variables in Loops
**What goes wrong:** Variables declared with `const`/`let` inside a `.map()` callback body (like `const index = i + 1`) are block-scoped to the loop iteration. They must be treated as loop-local variables for q:p delivery.
**Why it happens:** The capture analysis sees them as undeclared in the handler function, but they are loop-local, not module-level captures.
**How to avoid:** When classifying captures, check if the variable is declared within any enclosing loop body. If so, treat it as a loop param, not a _captures variable.
**Warning signs:** `captures: true` on handlers that should have `captures: false` with paramNames.

### Pitfall 2: Nested Loop Cross-Scope Captures
**What goes wrong:** An inner loop handler captures a variable from an outer loop. This needs `.w([outerVar])` hoisting in the parent body, placed BEFORE the inner loop.
**Why it happens:** The variable is not in the inner loop's iteration variables but IS in the outer loop's scope.
**How to avoid:** Walk all enclosing loops to determine which loop scope each captured variable belongs to. Only variables from the SAME loop as the JSX element get `q:p`; variables from outer loops get `.w()`.

### Pitfall 3: q:p vs q:ps and Variable Ordering
**What goes wrong:** Multiple loop variables on a single element need `q:ps: [sorted(vars)]` not `q:p`.
**How to avoid:** Already handled by `buildQpProp` in loop-hoisting.ts. Ensure the loop-var list passed to it includes block-scoped variables, not just the iteration params.

### Pitfall 4: Flags Bit 2 (Loop Context)
**What goes wrong:** The flags bitmask bit 2 (value 4) must be set when `q:p`/`q:ps` is present on an element.
**How to avoid:** The `computeFlags` function already takes a `loopCtx` parameter. Verify it's passed correctly.

## Code Examples

### Expected: Simple Loop Handler Segment
```javascript
// Source: should_transform_block_scoped_variables_in_loop.snap
// Segment receives loop var `index` as 3rd param (after _, _1 padding)
export const test_component_div_div_q_e_click_Mc600uqO6ps = (_, _1, index) => console.log(index);
// Metadata: captures: false, paramNames: ["_", "_1", "index"]
```

### Expected: Cross-Scope Capture Segment
```javascript
// Source: should_transform_nested_loops.snap
// Inner handler captures `row` from outer loop via _captures
import { _captures } from "@qwik.dev/core";
//
export const Foo_component_div_div_p_q_e_click_PjMbeUzoAMk = (_, _1, item) => {
    const row = _captures[0];
    return console.log(row.value.id, item.value.id);
};
// Metadata: captures: true, captureNames: ["row"], paramNames: ["_", "_1", "item"]
```

### Expected: .w() Hoisting in Parent Body
```javascript
// Source: should_transform_nested_loops.snap
// Parent segment hoists .w([row]) before inner loop
export const Foo_component_HTDRsvUbLiE = function() {
    const data = useSignal([]);
    const data2 = useSignal([]);
    return _jsxSorted("div", null, null, data.value.map((row) => {
        // .w() hoisted here, capturing outer-scope `row` for inner handler
        const Foo_component_div_div_p_q_e_click_PjMbeUzoAMk = q_Foo_component_div_div_p_q_e_click_PjMbeUzoAMk.w([row]);
        return _jsxSorted("div", {
            "q-e:click": q_Foo_component_div_div_q_e_click_vKrX4PmH2aM,
            "q:p": row
        }, null, data2.value.map((item) => _jsxSorted("p", {
                "q-e:click": Foo_component_div_div_p_q_e_click_PjMbeUzoAMk,
                "q:p": item
            }, null, [/* signals */], 4, "u6_0")), 4, "u6_1");
    }), 1, "u6_2");
};
```

### Expected: Non-Capturing Event in Loop
```javascript
// Source: should_not_wrap_fn.snap
// Handler captures variable via q:p (NOT _captures)
// Metadata: captures: false, paramNames: ["_", "_1", "currentType"]
export const Cmp_component_Fragment_button_q_e_click_veAZ2ow0cnM = (_, _1, currentType) => currentType.value = 'NEXT';
// Parent has: _jsxSorted("button", {"q:p": currentType}, {"q-e:click": q_handler}, ...)
```

## Implementation Approach

### Step 1: Segment Signature Rewriting
In `segment-codegen.ts`, when `paramNames` has entries (from extraction metadata), rewrite the function signature to include the padding parameters. The bodyText `() => expr` becomes `(_, _1, loopVar) => expr`.

### Step 2: Loop-Aware Capture Classification
In `transform.ts` capture analysis section, after `analyzeCaptures` runs:
- Detect if the extraction is inside a loop (using `findEnclosingLoop` on ancestors)
- Classify each captured variable: is it a loop iteration variable, a block-scoped variable inside the loop body, or an outer-scope variable?
- Loop-local variables: set as paramNames, remove from captureNames, set captures=false
- Outer-scope variables: keep in captureNames, set captures=true

### Step 3: .w() Hoisting in Segment Body
In `segment-codegen.ts` (for parent segments with children inside loops) or `rewrite-parent.ts` (for parent module when children have cross-scope captures):
- When a child extraction has `captures=true` AND is inside a loop, generate `.w([captureNames])` hoisting declaration in the parent's body, positioned before the loop containing the child.

### Step 4: q:p Prop Placement Correction
In `jsx-transform.ts`, correct the placement of `q:p`/`q:ps`:
- When handler has captures (`.w()` needed): put `q:p` in varEntries
- When handler has no captures: put `q:p` in constEntries (current behavior, correct for simple cases)

### Step 5: Signal Hoisted Function Deduplication
In `signal-analysis.ts`, deduplicate identical hoisted `_hf` functions so the same accessor pattern reuses the same hoisted declaration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| P12-01 | Loop handler param injection | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_transform_block_scoped"` |
| P12-02 | Cross-scope .w() hoisting | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_transform_nested_loops"` |
| P12-03 | Captures metadata correctness | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_wrap_fn"` |
| P12-04 | All 21 snapshots pass | convergence | `npx vitest run tests/optimizer/convergence.test.ts` |
| P12-05 | No regressions | unit | `npx vitest run` |

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements via convergence.test.ts.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | q:p placement in varEntries vs constEntries depends on whether handler has .w() captures | Architecture Patterns | q:p would be in wrong JSX arg slot, causing parent mismatch |
| A2 | Block-scoped variables inside loop body (const index = i+1) are treated as loop-local for q:p delivery | Pitfall 1 | Block-scoped vars would be incorrectly classified as _captures |
| A3 | Signal hoisted function deduplication uses expression text equality | Implementation Step 5 | Duplicate _hf functions would cause segment code mismatch |

## Open Questions

1. **q:p vs constEntries placement rule**
   - What we know: Some snapshots show q:p in varEntries (2nd arg), others in constEntries (3rd arg)
   - What's unclear: The exact rule for when q:p goes in which slot
   - Recommendation: Analyze all 21 snapshots systematically during planning to determine the precise rule. Likely: q:p goes to varEntries only when the event handler for that element has `.w()` captures.

2. **Block-scoped variable scope resolution**
   - What we know: `const index = i+1` inside `.map()` callback should be treated as loop-local
   - What's unclear: Whether the existing capture analysis already considers this or needs extension
   - Recommendation: Test with existing `getUndeclaredIdentifiersInFunction` -- if it already excludes block-scoped loop vars from captures, we only need paramNames injection.

## Sources

### Primary (HIGH confidence)
- All 21 Phase 12 snapshot files in `match-these-snaps/` -- [VERIFIED: filesystem] examined every snapshot's expected output
- Diagnostic script output comparing actual vs expected for all 21 -- [VERIFIED: runtime]
- `src/optimizer/transform.ts` -- [VERIFIED: source code] current pipeline implementation
- `src/optimizer/segment-codegen.ts` -- [VERIFIED: source code] current segment code generation
- `src/optimizer/loop-hoisting.ts` -- [VERIFIED: source code] existing loop detection utilities
- `src/optimizer/capture-analysis.ts` -- [VERIFIED: source code] current capture analysis
- `src/optimizer/jsx-transform.ts` -- [VERIFIED: source code] q:p/q:ps injection logic

## Metadata

**Confidence breakdown:**
- Failure classification: HIGH -- all 21 snapshots analyzed with diagnostic script, exact diffs captured
- Architecture patterns: HIGH -- derived directly from snapshot expected output
- Implementation approach: MEDIUM -- the q:p placement rule (A1) needs verification during execution
- Pitfalls: HIGH -- failure patterns clearly show these exact issues

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- snapshot corpus does not change)
