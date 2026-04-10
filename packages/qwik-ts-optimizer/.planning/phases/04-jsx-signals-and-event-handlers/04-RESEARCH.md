# Phase 4: JSX, Signals, and Event Handlers - Research

**Researched:** 2026-04-10
**Domain:** JSX transformation, signal optimization, event handler extraction, loop-context hoisting
**Confidence:** HIGH

## Summary

Phase 4 transforms JSX syntax into Qwik's optimized runtime calls. This is the largest and most complex phase, touching five interrelated subsystems: (1) JSX element transformation to `_jsxSorted`/`_jsxSplit` calls with prop classification, (2) signal expression detection and wrapping with `_wrapProp`/`_fnSignal`, (3) event handler extraction as segments with `q-e:`/`q-d:`/`q-w:` prefixes, (4) `bind:value`/`bind:checked` syntax desugaring, and (5) loop-context hoisting with `q:p`/`q:ps` injection.

The existing codebase (Phases 1-3) already handles segment extraction, capture analysis, variable migration, and parent rewriting. Phase 4 needs to add a JSX transformation pass that runs within segment bodies (and potentially inline in the parent for inline/hoist entry strategy). The snapshot corpus contains approximately 77 JSX-related snapshots providing exact expected output.

**Primary recommendation:** Build five focused modules (jsx-transform, signal-analysis, event-handler-transform, bind-transform, loop-hoisting) that integrate into the existing `transformModule()` pipeline. Process JSX after extraction but before final codegen, operating on segment body text via magic-string.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JSX-01 | Transform JSX elements to `_jsxSorted(tag, varProps, constProps, children, flags, key)` | Snapshot corpus shows exact call signature; see Architecture Patterns section |
| JSX-02 | Classify props into varProps (mutable) and constProps (immutable) | Immutability analysis rules documented from snapshot evidence |
| JSX-03 | Compute flags bitmask encoding children type and mutability | Flags values 1,2,3,4,6 documented with meanings |
| JSX-04 | Generate deterministic keys (`u6_N` pattern) for JSX elements | Key generation counter documented |
| JSX-05 | Handle `_jsxSplit` for elements with spread props | Spread detection and `_getVarProps`/`_getConstProps` pattern documented |
| JSX-06 | Handle fragment transform | Fragment imported from `@qwik.dev/core/jsx-runtime` as `_Fragment` |
| SIG-01 | Detect `signal.value` in JSX props, wrap with `_wrapProp(signal)` | Pattern documented from derived_signals snapshots |
| SIG-02 | Detect `store.field` in JSX props, wrap with `_wrapProp(store, "field")` | Pattern documented from props_wrapping snapshots |
| SIG-03 | Detect computed expressions, generate `_fnSignal(_hfN, [deps], _hfN_str)` | Hoisted function pattern documented |
| SIG-04 | Hoist signal functions to module scope as `_hf0`, `_hf1` | Naming and string representation documented |
| SIG-05 | Correctly identify when NOT to wrap | Non-wrap conditions documented from snapshot evidence |
| EVT-01 | Transform `onClick$` to `q-e:click` in constProps | Event naming rules documented |
| EVT-02 | Transform `document:onFocus$` to `q-d:focus` | Document-scope prefix mapping documented |
| EVT-03 | Transform `window:onClick$` to `q-w:click` | Window-scope prefix mapping documented |
| EVT-04 | Handle custom event names and kebab-case conversion | Kebab-case rules documented from jsx_listeners snapshot |
| EVT-05 | Handle passive events and preventdefault directives | Passive prefix mapping (`q-ep:`, `q-wp:`, `q-dp:`) documented |
| EVT-06 | Extract event handler closures as segments | Event handler segment extraction pattern documented |
| BIND-01 | Transform `bind:value` to value prop + `q-e:input` handler with `inlinedQrl` | `inlinedQrl(_val, "_val", [signal])` pattern documented |
| BIND-02 | Transform `bind:checked` to checked prop + `q-e:input` handler | `inlinedQrl(_chk, "_chk", [signal])` pattern documented |
| BIND-03 | Preserve unknown `bind:xxx` attributes as-is | Passthrough behavior documented |
| LOOP-01 | Hoist `.w([captures])` above loops | Hoisting pattern with `const name = qrl.w([...])` documented |
| LOOP-02 | Inject `q:p` prop for iteration variable access | Single paramName uses `q:p` |
| LOOP-03 | Inject `q:ps` for multiple handler captures on same element | Multiple paramNames use `q:ps` (sorted alphabetically) |
| LOOP-04 | Generate positional parameter padding (`_`, `_1`, `_2`) | Padding pattern documented from nested loop snapshot |
| LOOP-05 | Handle all loop types (map, for-i, for-of, for-in, while/do-while) | All 5 loop types documented with examples |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| oxc-parser | ^0.124.0 | Parse JSX AST for transformation | Already in project; needed to walk JSX nodes |
| oxc-walker | ^0.6.0 | Walk AST with scope tracking | Already in project; needed for JSX visitor |
| magic-string | ^0.30.21 | Surgical text replacement for JSX output | Already in project; all transforms use this |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.4 | Test runner | All new tests |
| fast-deep-equal | ^3.1.3 | Deep equality for AST comparison | Test utilities |

No new dependencies needed for Phase 4.

## Architecture Patterns

### New Module Structure
```
src/optimizer/
  jsx-transform.ts         # JSX element -> _jsxSorted/_jsxSplit calls
  signal-analysis.ts       # Detect signal/store expressions, generate _wrapProp/_fnSignal
  event-handler-transform.ts  # Event prop naming (q-e:, q-d:, q-w:, passive)
  bind-transform.ts        # bind:value/bind:checked desugaring
  loop-hoisting.ts         # Loop detection, .w() hoisting, q:p/q:ps injection
```

### Pattern 1: _jsxSorted Call Signature
**What:** Every JSX element becomes `_jsxSorted(tag, varProps, constProps, children, flags, key)` [VERIFIED: snapshot corpus]
**When to use:** All JSX elements without spread props

```typescript
// Source: qwik_core__test__example_jsx.snap
// <div class="class">12</div>
_jsxSorted("div", null, { class: "class" }, "12", 3, null)

// <Lightweight {...props}/>
_jsxSplit("button", { ..._getVarProps(props) }, _getConstProps(props), null, 0, null)
```

**Arguments:**
1. `tag` - String literal for HTML elements, identifier for components
2. `varProps` - Mutable props object or `null` (things that change at runtime)
3. `constProps` - Immutable props object or `null` (things known at compile time)
4. `children` - Single child, array of children, or `null`
5. `flags` - Bitmask integer (see Flags section)
6. `key` - String key (`"u6_N"` auto-generated, explicit `key=` prop, or `null`)

### Pattern 2: Props Classification (varProps vs constProps)

**Immutable (constProps):** [VERIFIED: snapshot corpus - example_immutable_analysis.snap, example_derived_signals_div.snap]
- String literals: `"text"`, template literals without expressions
- Number literals: `1`, `2`
- Boolean literals: `true`, `false`
- Template expressions with only constants: `` `text${12}` ``
- Ternary with only constants: `typeof x === 'string' ? 12 : 43`
- Imported values (from `import`): `dep`, `dep.thing`, `dep.thing + 'stuff'`
- CSS module references: `styles.foo`
- Signal references (not `.value`): `signal` (the signal itself is immutable)
- `_wrapProp()` calls: always in constProps
- `_fnSignal()` calls: always in constProps
- Event handlers (q-e:, q-d:, q-w:): always in constProps
- QRL references from extracted handlers: always in constProps

**Mutable (varProps):** [VERIFIED: snapshot corpus]
- Global variable access: `globalThing`, `globalThing.thing`
- `window.document` and similar runtime-dependent values
- Function calls that may have side effects: `signal.value()`, `unknown()`
- `signal.value + unknown()` (any expression with unknown call)
- `signal.value + dep` (signal.value mixed with non-signal)
- `mutable(signal)` wrapper
- `class` prop with object containing runtime expressions: `{ even: count % 2 === 0 }`
- `props.onClick$` (forwarded handler props on native elements)

**Critical distinction for HTML elements vs Components:** [VERIFIED: snapshot corpus]
- On HTML elements (`<div>`, `<p>`, `<button>`): event handlers like `onClick$` are extracted as segments and placed in constProps as `"q-e:click": qrlRef`
- On components (`<Div>`, `<CustomComponent>`): `onClick$` stays as-is (component handles it), placed in constProps if the value is a QRL, in varProps if forwarded

### Pattern 3: Flags Bitmask

Observed flag values from snapshots: [VERIFIED: snapshot corpus]
- `0` - Used with `_jsxSplit` (spread props, unknown mutability)
- `1` - Children are mutable/dynamic (expressions, variables)
- `2` - Props contain varProps (mutable props present)
- `3` - Immutable (no varProps, const children) = `1 | 2` (both bits set = fully const)
- `4` - Loop context (has `q:p` or `q:ps`) -- children may be dynamic
- `6` - Loop context with for-of pattern = `4 | 2`

**Interpretation (based on bit analysis):** [ASSUMED]
- Bit 0 (value 1): children type flag
- Bit 1 (value 2): props mutability flag  
- Bit 2 (value 4): loop context flag
- `3` = `0b011` = immutable props + const children (most common for static elements)
- `1` = `0b001` = children dynamic, no var props
- `2` = `0b010` = has var props
- `4` = `0b100` = loop context present

### Pattern 4: Key Generation

Keys follow `"u6_N"` pattern where N is a zero-based counter per module. [VERIFIED: snapshot corpus]
- Auto-generated for elements without explicit `key` prop
- Counter resets per file/segment
- Explicit `key={value}` prop is extracted and used directly as the key argument
- Not all elements get keys -- single children may get `null` key

### Pattern 5: Event Handler Naming

Event prop names are transformed to Qwik's serialized event format: [VERIFIED: snapshot corpus - should_convert_jsx_events.snap, example_jsx_listeners.snap]

| JSX Prop | Output Prop | Scope |
|----------|-------------|-------|
| `onClick$` | `"q-e:click"` | Element |
| `onDblClick$` | `"q-e:dblclick"` | Element |
| `on-anotherCustom$` | `"q-e:another-custom"` | Element |
| `document:onFocus$` | `"q-d:focus"` | Document |
| `window:onClick$` | `"q-w:click"` | Window |
| `onDocument:keyup$` | `"q-e:document:keyup"` | Multi-scope |
| `onWindow:keyup$` | `"q-e:window:keyup"` | Multi-scope |
| `host:onClick$` | `"host:onClick$"` | Host (passthrough) |
| `onDocumentScroll$` | `"q-e:documentscroll"` | Element (camelCase becomes lowercase) |
| `onDocument-sCroll$` | `"q-e:document--scroll"` | Element (dash preserved, kebab-case) |

**Naming rules:** [VERIFIED: jsx_listeners snapshot]
1. Strip `$` suffix
2. If prefixed with `document:`, use `q-d:` prefix, strip `on` prefix
3. If prefixed with `window:`, use `q-w:` prefix, strip `on` prefix
4. If prefixed with `host:`, keep as-is (passthrough)
5. Otherwise, use `q-e:` prefix, strip `on` prefix
6. Event name: strip `on`/`on-` prefix, convert to lowercase
7. For `on-customName$` pattern: strip `on-`, convert `customName` to `custom-name` (kebab-case)

**Passive event prefixes:** [VERIFIED: should_convert_passive_jsx_events.snap]
- `passive:click` + `onClick$` = `"q-ep:click"` (element passive)
- `passive:scroll` + `window:onScroll$` = `"q-wp:scroll"` (window passive)
- `passive:touchstart` + `document:onTouchStart$` = `"q-dp:touchstart"` (document passive)
- `passive:mouseover` alone (no handler) = stripped entirely

### Pattern 6: Signal Wrapping

**`_wrapProp(signal)`** - for `signal.value` access in props: [VERIFIED: example_derived_signals_cmp.snap]
```typescript
// signalValue={signal.value} -> signalValue: _wrapProp(signal)
```

**`_wrapProp(store, "field")`** - for `store.field` access in props: [VERIFIED: example_derived_signals_children.snap]
```typescript
// {props['data-nu']} -> _wrapProp(props, "data-nu")
// {props.class} -> _wrapProp(props, "class")
```

**`_fnSignal(_hfN, [deps], _hfN_str)`** - for computed expressions: [VERIFIED: example_derived_signals_cmp.snap]
```typescript
// signalComputedValue={12 + signal.value}
// Hoisted: const _hf0 = (p0) => 12 + p0.value;
//          const _hf0_str = "12+p0.value";
// Output:  signalComputedValue: _fnSignal(_hf0, [signal], _hf0_str)
```

**Hoisted function generation rules:**
1. Each unique computed expression gets a `_hfN` function hoisted to module top
2. Dependencies become `p0`, `p1`, etc. parameters  
3. The string representation has specific formatting: minimal whitespace, preserves quotes
4. Object expressions use `{key:value}` format (no spaces)
5. Ternary uses `condition?true:false` format

**When NOT to wrap (stays as mutable/varProps):** [VERIFIED: example_derived_signals_cmp.snap]
- `signal.value()` -- function call on `.value`
- `signal.value + unknown()` -- mixed with unknown function call
- `mutable(signal)` -- explicit mutable wrapper
- `signal.value + dep` -- signal.value mixed with non-signal import

### Pattern 7: Loop Hoisting

When event handlers are inside loops, `.w([captures])` is hoisted above the loop: [VERIFIED: example_component_with_event_listeners_inside_loop.snap]

```typescript
// Before:
// results.map((item) => <span onClick$={() => cart.push(item)}>{item}</span>)

// After:
const handler_qrl = q_handler.w([cart]);  // Hoisted above loop
results.map((item) => 
  _jsxSorted("span", {
    "q-e:click": handler_qrl,
    "q:p": item  // Loop variable passed as positional param
  }, null, item, 4, "u6_0")
)
```

**Positional parameters:** [VERIFIED: example_component_with_event_listeners_inside_loop.snap]
- Loop iteration variables become positional parameters in the segment
- Segment signature: `(_, _1, loopVar)` where `_`, `_1` are padding for unused positions
- `q:p` carries a single loop variable value
- `q:ps` carries multiple loop variables as an array (sorted alphabetically)

**Nested loops:** [VERIFIED: should_transform_handlers_capturing_cross_scope_in_nested_loops.snap]
- Inner loop variables from outer loops are passed through captures (`.w()`)
- Inner loop's own variables are passed via `q:p`/`q:ps`
- `.w()` is placed in the scope where captures are available (e.g., inside outer loop body but above inner loop)

### Pattern 8: bind: Syntax

**`bind:value`:** [VERIFIED: example_input_bind.snap]
```typescript
// <input bind:value={value} />
// becomes:
_jsxSorted("input", null, {
  "value": value,
  "q-e:input": inlinedQrl(_val, "_val", [value])
}, null, 3, null)
```

**`bind:checked`:** [VERIFIED: example_input_bind.snap]
```typescript
// <input bind:checked={checked} />
_jsxSorted("input", null, {
  "checked": checked,
  "q-e:input": inlinedQrl(_chk, "_chk", [checked])
}, null, 3, null)
```

**Merging with existing onInput$:** [VERIFIED: should_merge_on_input_and_bind_checked.snap]
```typescript
// <input bind:checked={localValue} onInput$={() => console.log("test")} />
// q-e:input becomes an ARRAY merging bind handler and explicit handler:
"q-e:input": [
  inlinedQrl(_chk, "_chk", [localValue]),
  q_FieldInput_component_input_q_e_input_wqR1xEjZjf4
]
```

**Unknown bind:** [VERIFIED: example_input_bind.snap]
```typescript
// <input bind:stuff={stuff} />
// Stays as-is:
"bind:stuff": stuff
```

**bind with spread:** [VERIFIED: should_move_bind_value_to_var_props.snap]
```typescript
// <input {...rest} bind:value={finalValue} onClick$={...} />
// Uses _jsxSplit, bind:value goes to varProps spread:
_jsxSplit("input", {
  ..._getVarProps(rest),
  ..._getConstProps(rest),
  "bind:value": finalValue
}, {
  "q-e:click": handler_qrl
}, null, 0, "u6_0")
```

### Pattern 9: ctxKind for JSX Props

When a `$`-suffixed prop on a JSX element has an inline closure, the extracted segment gets `ctxKind: "jSXProp"` (not `"eventHandler"`). [VERIFIED: example_immutable_analysis.snap]

This applies to non-event `$` props like `transparent$`, `immutable4$`, and `onEvent$` (on custom components).

For standard event handlers on HTML elements (`onClick$`, `onBlur$`, etc.), `ctxKind` remains `"eventHandler"`.

### Pattern 10: Non-Element Event Handling

Event handlers on **component** elements are NOT transformed to `q-e:` prefixes. [VERIFIED: should_not_transform_events_on_non_elements.snap]

```typescript
// <CustomComponent onClick$={() => {}}/>
// Stays as: onClick$={qrlRef}  (no q-e: prefix)
// But the closure IS still extracted as a segment
```

### Pattern 11: Fragment Handling

Fragments (`<>...</>`) become `_jsxSorted(_Fragment, ...)` with `_Fragment` imported from `@qwik.dev/core/jsx-runtime`. [VERIFIED: example_jsx.snap]

### Anti-Patterns to Avoid
- **Transforming JSX in one giant pass:** Split into sub-concerns (prop classification, signal detection, event naming, bind desugaring) -- they compose but are independently testable
- **Mutating AST nodes directly:** Use magic-string text replacement; do NOT build a new AST and reprint
- **Ignoring element vs component distinction:** Event handler `q-e:` transformation only applies to HTML elements (lowercase tag), not components (uppercase/dot-notation tag)
- **Forgetting loop detection for hoisting:** Must detect `.map()`, `for`, `for-of`, `for-in`, `while`, `do-while` as loop contexts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSX AST walking | Custom JSX visitor from scratch | oxc-walker with enter/leave hooks | Scope tracking included |
| Event name kebab-case | Custom string transformation | Well-tested conversion function | Edge cases with multi-word events |
| Signal expression detection | Simple regex on source | AST-based detection via MemberExpression analysis | `signal.value()` must NOT be wrapped, `signal.value` must be |
| Loop detection | Check only `.map()` calls | Detect all loop forms from AST node types | for-i, for-of, for-in, while, do-while all need hoisting |

## Common Pitfalls

### Pitfall 1: varProps/constProps Classification Edge Cases
**What goes wrong:** Incorrectly classifying a prop as const when it references runtime-mutable state, or vice versa
**Why it happens:** The classification rules have subtle cases (e.g., `window.document` is mutable, but `styles.foo` is const; `signal` alone is const but `signal.value` triggers wrapping)
**How to avoid:** Build a comprehensive `isImmutableExpression()` analyzer that traverses the expression AST. Test against the `example_immutable_analysis.snap` and `example_derived_signals_div.snap` snapshots
**Warning signs:** Tests failing on prop placement (wrong bucket)

### Pitfall 2: Event Naming on Components vs Elements
**What goes wrong:** Applying `q-e:click` transformation to component elements
**Why it happens:** Both `<div onClick$={...}>` and `<CustomComponent onClick$={...}>` have the same AST structure
**How to avoid:** Check if tag is lowercase string (HTML element) vs capitalized/dot-notation (component). Only HTML elements get `q-e:` prefix transformation
**Warning signs:** `should_not_transform_events_on_non_elements` snapshot failing

### Pitfall 3: _fnSignal String Representation
**What goes wrong:** The `_hfN_str` string doesn't match expected format
**Why it happens:** Qwik's Rust optimizer produces specific formatting for the string representation (minimal whitespace, specific quoting rules)
**How to avoid:** Study snapshot patterns carefully. Object literals use `{key:value}` (no spaces). Ternary uses `condition?true:false`. String quotes are preserved from source
**Warning signs:** Signal-related snapshot mismatches

### Pitfall 4: Loop Variable Positional Padding
**What goes wrong:** Wrong number of `_`, `_1`, `_2` padding parameters
**Why it happens:** The padding is positional -- the handler's original parameters come first (padded to event handler position), then loop variables
**How to avoid:** Handler segments in loops always get `(_, _1, loopVar)` where `_` and `_1` are the event and context params
**Warning signs:** Segment paramNames don't match snapshot metadata

### Pitfall 5: Nested Loop Capture Scope
**What goes wrong:** `.w()` hoisted too high or too low in nested loops
**Why it happens:** Each loop level has different available captures; inner loop captures from outer loop need separate handling
**How to avoid:** The `.w([captures])` must be placed at the scope where all captured variables are in scope. Study `should_transform_handlers_capturing_cross_scope_in_nested_loops.snap`
**Warning signs:** Runtime errors about undefined variables

### Pitfall 6: bind: Merging with Existing onInput$
**What goes wrong:** `bind:checked` + explicit `onInput$` produces two separate `q-e:input` entries instead of an array
**Why it happens:** Both bind and explicit handler target the same event name
**How to avoid:** Merge into array: `"q-e:input": [inlinedQrl(_chk, ...), handler_qrl]`
**Warning signs:** `should_merge_on_input_and_bind_checked` snapshot failing

### Pitfall 7: SegmentAnalysis.ctxKind Type
**What goes wrong:** TypeScript type error because `'jSXProp'` is not in the union type
**Why it happens:** Current `ctxKind` type is `'eventHandler' | 'function'` but snapshots show `'jSXProp'` for non-event `$`-suffixed JSX props
**How to avoid:** Extend `ctxKind` union to include `'jSXProp'`
**Warning signs:** Type errors during compilation

## Code Examples

### JSX Transform - Basic Element
```typescript
// Source: qwik_core__test__example_jsx.snap [VERIFIED]
// Input: <div class="class">12</div>
// Output:
/*#__PURE__*/ _jsxSorted("div", null, {
    class: "class"
}, "12", 3, null)
```

### Signal Wrapping - _wrapProp
```typescript
// Source: qwik_core__test__example_derived_signals_cmp.snap [VERIFIED]
// Input: signalValue={signal.value}
// Output:
signalValue: _wrapProp(signal)

// Input: {props['data-nu']} (in children)
// Output:
_wrapProp(props, "data-nu")
```

### Signal Wrapping - _fnSignal with Hoisted Function
```typescript
// Source: qwik_core__test__example_derived_signals_cmp.snap [VERIFIED]
// Hoisted to module scope:
const _hf0 = (p0) => 12 + p0.value;
const _hf0_str = "12+p0.value";

// At prop site:
signalComputedValue: _fnSignal(_hf0, [signal], _hf0_str)
```

### Event Handler Transform
```typescript
// Source: qwik_core__test__should_convert_jsx_events.snap [VERIFIED]
// Input: <button onClick$={() => {}} onBlur$={() => {}}>
// Output (in constProps):
{
    "q-e:click": q_handler_click_qrl,
    "q-e:blur": q_handler_blur_qrl
}
```

### Loop Hoisting with q:p
```typescript
// Source: qwik_core__test__example_component_with_event_listeners_inside_loop.snap [VERIFIED]
// Hoisted BEFORE the loop:
const handler = q_handler_qrl.w([cart]);

// Inside the loop:
results.map((item) => _jsxSorted("span", {
    "q-e:click": handler,
    "q:p": item
}, null, item, 4, "u6_0"))
```

### bind:value Transform
```typescript
// Source: qwik_core__test__example_input_bind.snap [VERIFIED]
_jsxSorted("input", null, {
    "value": value,
    "q-e:input": inlinedQrl(_val, "_val", [value])
}, null, 3, null)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SWC Rust optimizer | TypeScript optimizer (this project) | 2026 | Enables AI-assisted development, easier debugging |
| `_jsxQ` / `_jsxC` | `_jsxSorted` | Qwik v2 | Unified call with sorted prop classification |
| `jsx-runtime` h() | `_jsxSorted` / `_jsxSplit` | Qwik v2 | Optimized for serialization and resumability |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Flags bitmask interpretation (bit 0 = children, bit 1 = props, bit 2 = loop) | Pattern 3: Flags Bitmask | Would produce wrong flags values; mitigated by snapshot validation |
| A2 | Key counter resets per file/segment | Pattern 4: Key Generation | Would produce wrong key values; easily caught by snapshot tests |
| A3 | `_hfN_str` formatting follows consistent minimal-whitespace rules | Pattern 6: Signal Wrapping | String mismatch would break runtime signal tracking |

## Open Questions

1. **Inline/Hoist entry strategy interaction with JSX**
   - What we know: Snapshots show `_noopQrl` + `.s()` pattern for inline strategy
   - What's unclear: Whether JSX transform needs to handle this in Phase 4 or Phase 5
   - Recommendation: Phase 4 targets the `qrl(() => import(...))` (smart/default) entry strategy. `_noopQrl` + `.s()` is Phase 5 (ENT-02)

2. **Signal wrapping in children vs props**
   - What we know: `_wrapProp` is used in both props and children positions
   - What's unclear: Whether children use exact same detection rules as props
   - Recommendation: Treat children expressions with same signal analysis as props (snapshots confirm identical patterns)

3. **`_hf` function deduplication**
   - What we know: Each unique expression gets its own `_hfN`
   - What's unclear: Whether identical expressions in different contexts share the same `_hf`
   - Recommendation: Start with per-expression allocation, optimize later if needed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JSX-01 | JSX -> _jsxSorted calls | unit + snapshot | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` | Wave 0 |
| JSX-02 | varProps/constProps classification | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| JSX-03 | Flags bitmask computation | unit | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` | Wave 0 |
| JSX-04 | Key generation (u6_N) | unit | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` | Wave 0 |
| JSX-05 | _jsxSplit for spread props | unit + snapshot | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` | Wave 0 |
| JSX-06 | Fragment transform | unit + snapshot | `pnpm vitest run tests/optimizer/jsx-transform.test.ts` | Wave 0 |
| SIG-01 | signal.value -> _wrapProp | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| SIG-02 | store.field -> _wrapProp | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| SIG-03 | Computed -> _fnSignal | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| SIG-04 | _hf hoisting | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| SIG-05 | Non-wrap conditions | unit | `pnpm vitest run tests/optimizer/signal-analysis.test.ts` | Wave 0 |
| EVT-01 | onClick$ -> q-e:click | unit + snapshot | `pnpm vitest run tests/optimizer/event-handler-transform.test.ts` | Wave 0 |
| EVT-02 | document:onFocus$ -> q-d:focus | unit | `pnpm vitest run tests/optimizer/event-handler-transform.test.ts` | Wave 0 |
| EVT-03 | window:onClick$ -> q-w:click | unit | `pnpm vitest run tests/optimizer/event-handler-transform.test.ts` | Wave 0 |
| EVT-04 | Custom events kebab-case | unit | `pnpm vitest run tests/optimizer/event-handler-transform.test.ts` | Wave 0 |
| EVT-05 | Passive events | unit + snapshot | `pnpm vitest run tests/optimizer/event-handler-transform.test.ts` | Wave 0 |
| EVT-06 | Event handler segment extraction | integration + snapshot | `pnpm vitest run tests/optimizer/snapshot-batch.test.ts` | Wave 0 |
| BIND-01 | bind:value | unit + snapshot | `pnpm vitest run tests/optimizer/bind-transform.test.ts` | Wave 0 |
| BIND-02 | bind:checked | unit + snapshot | `pnpm vitest run tests/optimizer/bind-transform.test.ts` | Wave 0 |
| BIND-03 | bind:unknown passthrough | unit | `pnpm vitest run tests/optimizer/bind-transform.test.ts` | Wave 0 |
| LOOP-01 | .w() hoisting above loops | unit + snapshot | `pnpm vitest run tests/optimizer/loop-hoisting.test.ts` | Wave 0 |
| LOOP-02 | q:p injection | unit + snapshot | `pnpm vitest run tests/optimizer/loop-hoisting.test.ts` | Wave 0 |
| LOOP-03 | q:ps for multiple captures | unit + snapshot | `pnpm vitest run tests/optimizer/loop-hoisting.test.ts` | Wave 0 |
| LOOP-04 | Positional param padding | unit | `pnpm vitest run tests/optimizer/loop-hoisting.test.ts` | Wave 0 |
| LOOP-05 | All loop types | unit + snapshot | `pnpm vitest run tests/optimizer/loop-hoisting.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=dot`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + Phase 4 snapshot batch green

### Wave 0 Gaps
- [ ] `tests/optimizer/jsx-transform.test.ts` -- covers JSX-01 through JSX-06
- [ ] `tests/optimizer/signal-analysis.test.ts` -- covers SIG-01 through SIG-05
- [ ] `tests/optimizer/event-handler-transform.test.ts` -- covers EVT-01 through EVT-06
- [ ] `tests/optimizer/bind-transform.test.ts` -- covers BIND-01 through BIND-03
- [ ] `tests/optimizer/loop-hoisting.test.ts` -- covers LOOP-01 through LOOP-05
- [ ] Extend `tests/optimizer/snapshot-batch.test.ts` with Phase 4 snapshot list (~40+ new snapshots)

## Security Domain

Security not directly applicable to this phase. The optimizer transforms source code at build time; no user input is processed at runtime. Input validation (V5) is inherent in the AST parsing via oxc-parser. No authentication, session management, access control, or cryptography concerns.

## Sources

### Primary (HIGH confidence)
- Snapshot corpus (77 JSX-related files in `match-these-snaps/`) - exact expected output for all transformations
- `qwik_core__test__example_jsx.snap` - basic JSX transform patterns
- `qwik_core__test__example_immutable_analysis.snap` - prop classification rules
- `qwik_core__test__should_convert_jsx_events.snap` - event handler naming
- `qwik_core__test__example_derived_signals_cmp.snap` - signal wrapping
- `qwik_core__test__example_input_bind.snap` - bind syntax
- `qwik_core__test__example_component_with_event_listeners_inside_loop.snap` - loop hoisting
- `qwik_core__test__should_transform_handlers_capturing_cross_scope_in_nested_loops.snap` - nested loop patterns
- `qwik_core__test__should_convert_passive_jsx_events.snap` - passive event prefixes
- `qwik_core__test__example_jsx_listeners.snap` - event naming edge cases
- `qwik_core__test__should_merge_on_input_and_bind_checked.snap` - bind merging
- `qwik_core__test__should_move_bind_value_to_var_props.snap` - bind with spread
- `qwik_core__test__should_not_transform_events_on_non_elements.snap` - component vs element events
- `qwik_core__test__example_jsx_keyed.snap` - key generation
- `qwik_core__test__hoisted_fn_signal_in_loop.snap` - _fnSignal in loops

### Secondary (MEDIUM confidence)
- Existing codebase (`src/optimizer/*.ts`) - verified integration patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies needed, all tools proven in Phases 1-3
- Architecture: HIGH - snapshot corpus provides exact expected output for every pattern
- Pitfalls: HIGH - edge cases identified from specific snapshot variations
- Signal analysis: MEDIUM - flag bitmask interpretation is inferred from patterns, not documented
- Loop hoisting: MEDIUM - nested loop rules are complex and inferred from limited snapshots

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, snapshot corpus is the ground truth)
