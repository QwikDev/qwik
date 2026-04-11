# Phase 14: Segment Codegen Batch 2 - Research

**Researched:** 2026-04-10
**Domain:** Segment module code generation -- nested call rewriting, TS enum transpilation, _rawProps/rest props, bind merging, HMR, signal wrapping in segments
**Confidence:** HIGH

## Summary

Phase 14 addresses 25 snapshots where segments are found by name/hash but the segment CODE is wrong. Debugging all 25 reveals **7 distinct failure categories**. The most pervasive issue (10+ occurrences) is **nested marker call rewriting in segment bodies** -- where `useTask$()`, `useStyles$()`, `useResource$()`, etc. calls inside segments are being replaced with bare QRL variable references instead of `useTaskQrl(q_...)` call expressions. The second most common issue (5 occurrences) is **TS enum transpilation not running** in segment bodies. Additional issues include: _rawProps/rest-props transform not being applied (3), HMR-specific codegen missing (1), bind:value/bind:checked merging into arrays (2), `_fnSignal` wrapping incorrectly applied to component-element JSX props (2), and `moves_captures_when_possible` requiring cross-element unified q:ps slot allocation (1).

Of the 25 snapshots, 5 have parent module mismatches too. 3 are from TS enum transpilation (parent `var` vs expected `let`/IIFE patterns), 1 from HMR (missing `qrlDEV`/`_useHmr`), 1 from unwanted `_auto_` re-exports, and 1 from leftover original imports not being cleaned.

**Primary recommendation:** Fix the nested marker call rewriting in `segment-codegen.ts` so that `useTaskQrl()`, `useStylesQrl()`, etc. are actual call expressions with QRL args (not bare variable references); add TS enum transpilation support via oxc-transform; fix _rawProps/restProps transform for segment bodies; add HMR codegen; fix bind merging to produce arrays; suppress _fnSignal for component-element props.

## Architecture Patterns

### Failure Classification (all 25 snapshots, 39 segment mismatches)

| Issue Category | Seg Count | Snapshots | Fix Location |
|---|---|---|---|
| Nested marker calls emitted as bare refs (not `calleeQrl(q_...)`) | 12 | example_strip_exports_used, example_use_client_effect, example_use_server_mount, example_with_style, should_convert_rest_props, should_mark_props_as_var_props_for_inner_cmp | segment-codegen.ts or transform.ts |
| TS enum transpilation not applied | 5 | example_ts_enums, example_ts_enums_issue_1341, example_ts_enums_no_transpile (segment+parent) | transform.ts |
| _rawProps / _restProps not applied | 4 | should_convert_rest_props, should_destructure_args, should_make_component_jsx_split_with_bind | segment-codegen.ts |
| bind:value/bind:checked not merged into event arrays | 4 | should_merge_bind_value_and_on_input, should_merge_bind_checked_and_on_input, should_make_component_jsx_split_with_bind | jsx-transform.ts or bind-transform.ts |
| _fnSignal wrapping on component-element props | 3 | should_mark_props_as_var_props_for_inner_cmp, should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after | signal-analysis.ts or jsx-transform.ts |
| HMR codegen missing (_useHmr, qrlDEV, dev info) | 2 | hmr | transform.ts, segment-codegen.ts |
| q:ps slot allocation across multiple handlers | 4 | moves_captures_when_possible | segment-codegen.ts, variable-migration.ts |
| Suppressed diagnostic comment not stripped | 1 | should_disable_qwik_transform_error_by_code | segment-codegen.ts |
| Missing `//` separator | 1 | root_level_self_referential_qrl | segment-codegen.ts |
| Passive event handler suppression in segments | 1 | should_ignore_passive_jsx_events_without_handlers | jsx-transform.ts |
| _auto_ re-export not needed | 2 | example_strip_exports_used, should_disable_qwik_transform_error_by_code (parent) | variable-migration.ts |
| Spread JSX: _getVarProps/_getConstProps placement with createElement | 1 | example_spread_jsx | jsx-transform.ts |
| JSX spread with merged class signal | 2 | should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after | jsx-transform.ts |

[VERIFIED: debug script comparing actual vs expected output for all 25 snapshots]

### Detailed Issue Analysis

#### 1. Nested Marker Calls as Bare References (12 segments, 6 tests)

The most critical issue. In segment bodies, nested `$()` calls like `useTask$()`, `useStyles$()`, `useResource$()` are being replaced with just the QRL variable name, not wrapped in the `calleeQrl()` call:

```
// EXPECTED (correct):
useBrowserVisibleTaskQrl(q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.w([state]))

// ACTUAL (wrong):
q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA;
```

The bare reference produces a no-op expression statement. The fix requires the segment codegen nested call site rewriting to emit `calleeQrl(qrlVar)` for named markers (not bare `$()` calls), including `.w([captures])` chaining.

**Root cause:** `segment-codegen.ts` lines ~494-499 handle the non-JSX-attr, non-bare case but appear to only emit the QRL variable name without wrapping it in the `calleeQrl()` call. The parent module's `transformSCallBody()` at `rewrite-parent.ts:512` correctly does `child.qrlCallee + '(' + childVarName + ...` but the segment codegen path doesn't have equivalent logic.

**Affected tests:** example_strip_exports_used, example_use_client_effect, example_use_server_mount, example_with_style, should_convert_rest_props, should_mark_props_as_var_props_for_inner_cmp

#### 2. TS Enum Transpilation (5 segments, 3 tests + parents)

When `transpileTs: true`, TypeScript enums should be transpiled to JavaScript IIFE patterns. In segments, `Thing.A` should become `0` (the enum value). In parent modules, `enum Thing { A, B }` should become `var Thing = function(Thing) { ... }({})`.

```
// EXPECTED (segment): console.log(0)
// ACTUAL (segment):   console.log(Thing.A)

// EXPECTED (parent): export var Thing = function(Thing) { ... }({})
// ACTUAL (parent):   export let Thing = function(Thing) { ... }({})  // 'let' not 'var'
```

**Root cause:** oxc-transform's TypeScript transpilation either (a) doesn't inline enum member values in segment bodies, or (b) the segment body is extracted before TS transpilation runs. The parent `let` vs `var` difference suggests oxc-transform produces `let` while the Rust optimizer produces `var`.

**Affected tests:** example_ts_enums, example_ts_enums_issue_1341, example_ts_enums_no_transpile

#### 3. _rawProps / _restProps Transform Not Applied (4 segments, 3 tests)

Component segments with destructured props should have them rewritten to `_rawProps` accessor pattern:

```
// EXPECTED: export const X = (_rawProps) => { const props = _restProps(_rawProps, [...]) }
// ACTUAL:   export const X = ({ ...props }) => { ... }

// EXPECTED: export const X = (_rawProps) => { ... _wrapProp(_rawProps, "id") ... }
// ACTUAL:   export const X = ({ message, id, count: c, ...rest }) => { ... id ... }
```

**Root cause:** `applyRawPropsTransform()` is being called in segment-codegen.ts but it's not handling all cases. Specifically: (a) rest-props patterns `({ ...rest })` need `_restProps(_rawProps, [...])`, (b) destructured renamed props like `count: c` need `_wrapProp(_rawProps, "count")` not bare `c`, and (c) `useSignal` for `bind:value` patterns need `_jsxSplit` with bind, not `inlinedQrl(_val, ...)`.

**Affected tests:** should_convert_rest_props, should_destructure_args, should_make_component_jsx_split_with_bind

#### 4. bind:value / bind:checked Merging (4 segments, 2 tests)

When `bind:value` or `bind:checked` coexists with an `onInput$` handler, the expected output merges both into a `"q-e:input"` array:

```
// EXPECTED:
"q-e:input": [q_handler, inlinedQrl(_val, "_val", [localValue])]

// ACTUAL (split across var/const):
{ "q-e:input": q_handler }, { value: localValue, "q-e:input": inlinedQrl(_val, ...) }
```

**Root cause:** The bind transform and event handler transform are producing separate entries for the same event prop instead of merging them into an array.

**Affected tests:** should_merge_bind_value_and_on_input, should_merge_bind_checked_and_on_input

#### 5. _fnSignal on Component-Element Props (3 segments, 3 tests)

When a prop access like `props.src` is used as a JSX attribute on a **component element** (uppercase tag like `<Image>`), the expected output does NOT wrap it with `_fnSignal`. Component elements should pass props directly, not signal-wrapped:

```
// EXPECTED (Image component): src: `${props.src}`  (direct template literal)
// ACTUAL:                      src: _fnSignal(_hf0, [props], "`${p0.src}`")
```

Similarly, for spread props with `class` merging, the expected output uses `_fnSignal` at the top level of `_jsxSplit`, but the actual output doesn't produce the `_fnSignal` wrapper for the class array.

**Root cause:** Signal analysis doesn't distinguish between HTML-element and component-element contexts when deciding whether to wrap prop accesses with `_fnSignal`.

**Affected tests:** should_mark_props_as_var_props_for_inner_cmp, should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after

#### 6. HMR Codegen (2 segments, 1 test)

The `hmr` test expects:
- Parent: `qrlDEV()` instead of `qrl()`, with file/line/column metadata
- Parent: `componentQrl` aliased as `componentQrl1` to avoid naming collision
- Segments: `_useHmr("/user/qwik/src/test.tsx")` call injected at body start
- Segments: JSX dev info objects `{ fileName, lineNumber, columnNumber }` as extra arg

**Root cause:** HMR/dev-mode features not implemented in segment codegen or parent rewriting.

**Affected tests:** hmr

#### 7. q:ps Slot Allocation (4 segments, 1 test)

`moves_captures_when_possible` expects all handlers on the same element to share a unified `q:ps` slot allocation where capture variables are assigned to consistent slot positions across all handlers:

```
// EXPECTED: (_, _1, bar, _3, sig) => sig.value += bar.value    (5 slots, shared allocation)
// ACTUAL:   (_, _1, sig, _3, bar) => sig.value += bar.value    (wrong order)
```

The parent element should have `q:ps: [bar, foo, sig]` and each handler fills its captures into the correct slot positions with `_` padding.

**Root cause:** The per-handler param allocation doesn't coordinate slot positions across all handlers on the same element. The `moves_captures_when_possible` pattern requires a unified allocation where each handler knows which slots other handlers use.

**Affected tests:** moves_captures_when_possible

#### 8. Remaining Issues

- **should_disable_qwik_transform_error_by_code:** Segment body still has `/* @qwik-disable-next-line C05 */` comment and imports `_auto_useMemo$` instead of `useMemo$`. Parent exports unwanted `_auto_useMemo$`.
- **root_level_self_referential_qrl:** Missing `//` separator (AST comparison should pass regardless of whitespace -- need to verify this is actually failing the AST comparison).
- **should_ignore_passive_jsx_events_without_handlers:** Segment has flags `1` instead of `3` -- the `static children` flag bit is wrong for the parent `<div>` containing multiple static child elements.
- **example_spread_jsx:** JSX spread in segment uses `_jsxSplit` with `_getVarProps`/`_getConstProps` when some elements should use `_createElement` with raw spread instead. Also `_wrapProp(head, "title")` vs `head.title` for non-signal access.
- **hoisted_fn_signal_in_loop:** `_hf` numbering reversed (`_hf0`/`_hf1` swapped), `q:p` incorrectly injected on elements inside `.map()`, and flags `5` vs `3` / `7`.
- **issue_7216_add_test:** Spread with interleaved event handlers -- expected keeps original prop ordering with spread inline, actual splits into `_getVarProps`/`_getConstProps`.

### Fix Approach

**Wave 1: Nested marker call rewriting** (highest impact -- fixes 12 segment mismatches)
1. In `segment-codegen.ts`, the non-JSX-attr nested call path (line ~494) must emit `calleeQrl(qrlVar)` not just `qrlVar`
2. Include `.w([captures])` chaining when the child extraction has captures
3. Add `calleeQrl` import to segment imports (from @qwik.dev/core)

**Wave 2: TS enum transpilation + _rawProps + diagnostic stripping** (fixes 10+ mismatches)
1. Run oxc-transform with TS enum transpilation on segment bodies when `transpileTs: true`
2. Ensure `applyRawPropsTransform` handles rest-props destructuring to `_restProps(_rawProps, [...])`
3. Strip `@qwik-disable-next-line` comments from segment bodies
4. Fix _auto_ re-export suppression for non-migrated bindings

**Wave 3: Bind merging, signal wrapping, HMR, q:ps, spread** (fixes remaining mismatches)
1. Merge bind:value/bind:checked handlers with onInput$ handlers into arrays
2. Suppress _fnSignal on component-element prop accesses
3. Add HMR codegen (_useHmr injection, qrlDEV in parent)
4. Fix q:ps unified slot allocation for multiple handlers on same element
5. Fix spread JSX to preserve createElement for certain patterns

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TS enum transpilation | Custom enum inlining | `oxcTransformSync` with TypeScript config | Already handles enum member resolution, IIFE generation |
| Nested call rewriting | New rewriting logic | Port pattern from `transformSCallBody` in rewrite-parent.ts | Same logic, different context |
| Rest-props transform | Custom destructuring rewriter | Extend `applyRawPropsTransform` | It already handles most cases, just missing rest pattern |
| Comment stripping | Regex for `@qwik-disable` | Combine with existing body processing | Simple regex is fine here since it's a known comment pattern |

## Common Pitfalls

### Pitfall 1: Nested Call Callee Name Resolution
**What goes wrong:** The segment body has `useTask$(...)` but the expected output needs `useTaskQrl(...)`. The callee name must be looked up from the extraction metadata.
**Why it happens:** Each extraction stores `qrlCallee` (e.g., "useTaskQrl") which is the Qrl-suffixed version of the original callee. The segment codegen needs to use this.
**How to avoid:** Use `extraction.qrlCallee` from the nested child's extraction result, same as `transformSCallBody` does.
**Warning signs:** Segment bodies with bare QRL variable names as expression statements.

### Pitfall 2: TS Enum Transpilation Scope
**What goes wrong:** Enum transpilation in segments requires the enum declaration to be available. But the enum is in the parent module, not the segment.
**Why it happens:** The segment body references `Thing.A` -- if TS transpilation runs ONLY on the segment body text (not the full module), it won't know `Thing` is an enum.
**How to avoid:** Either (a) run oxc-transform on the parent first so enum values are inlined into the source before extraction, or (b) use const replacement to substitute enum member values in segment bodies based on enum declarations found in the parent.
**Warning signs:** `Thing.A` remaining in segment output instead of `0`.

### Pitfall 3: Parent Regressions from Segment Fixes
**What goes wrong:** Fixing segment codegen causes previously-passing parent tests to regress.
**Why it happens:** Changes to extraction, import handling, or variable migration can cascade to parent module output.
**How to avoid:** Run full convergence suite after each fix batch. The hard gate requires 49+ passing after Phase 14.
**Warning signs:** Parent tests that were passing now failing.

### Pitfall 4: Bind Merging Order Sensitivity
**What goes wrong:** The merged `q-e:input` array has handlers in wrong order.
**Why it happens:** The Rust optimizer puts the explicit onInput$ handler first, then the bind-generated handler.
**How to avoid:** Ensure explicit event handler QRL comes before bind-generated inlinedQrl in the merged array.
**Warning signs:** Array elements in wrong order.

## Code Examples

### Pattern: Nested Marker Call Rewriting in Segments

The fix for the most common issue -- nested marker calls should emit `calleeQrl(qrlVar)`:

```typescript
// In segment-codegen.ts, the nested call site handling:
// Instead of just emitting the QRL variable name:
//   bodyText = bodyText.slice(0, relStart) + site.qrlVarName + bodyText.slice(relEnd);
// Should emit the full calleeQrl() call:
//   bodyText = bodyText.slice(0, relStart) + `${site.qrlCallee}(${qrlRef})` + bodyText.slice(relEnd);

// Where qrlRef includes .w([captures]) if needed:
let qrlRef = site.qrlVarName;
if (site.captureNames && site.captureNames.length > 0) {
  qrlRef += '.w([\n    ' + site.captureNames.join(',\n    ') + '\n])';
}
const replacement = `${site.qrlCallee}(${qrlRef})`;
```
[ASSUMED -- derived from analysis of expected output patterns and transformSCallBody in rewrite-parent.ts]

### Pattern: TS Enum Value Inlining

For segment bodies referencing enum members, the enum values need to be resolved:

```typescript
// The oxc-transform with typescript: { onlyRemoveTypeImports: false }
// should handle enum transpilation, but it needs the enum DECLARATION
// in scope. Alternative: do const replacement of known enum values.
// enum Thing { A, B } -> Thing.A = 0, Thing.B = 1
```
[ASSUMED -- need to verify oxc-transform handles enum member inlining in isolation]

### Pattern: _restProps Transform

```typescript
// Input:  ({ ...props }) => { ... props.checked ... }
// Output: (_rawProps) => { const props = _restProps(_rawProps); ... props.checked ... }

// Input:  ({ message, id, count: c, ...rest }) => { ... }
// Output: (_rawProps) => { const rest = _restProps(_rawProps, ["message", "id", "count"]); ... }
```
[VERIFIED: expected output from should_convert_rest_props and should_destructure_args snapshots]

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
| P14-01 | Nested marker calls emit calleeQrl(qrlVar) | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_use_client_effect"` | existing |
| P14-02 | TS enum transpilation in segments | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_ts_enums"` | existing |
| P14-03 | _rawProps/_restProps in segments | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_convert_rest_props"` | existing |
| P14-04 | bind merging into arrays | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_merge_bind_value_and_on_input"` | existing |
| P14-05 | All 25 Phase 14 snapshots pass | convergence | `npx vitest run tests/optimizer/convergence.test.ts` | existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "AFFECTED_SNAPSHOT"`
- **Per wave merge:** `npx vitest run tests/optimizer/convergence.test.ts`
- **Phase gate:** 74/209+ passing (49 current + 25 new), zero regressions

### Wave 0 Gaps
None -- existing convergence test infrastructure covers all phase requirements.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nested marker call rewriting needs qrlCallee stored in NestedCallSiteInfo | Issue 1 | Would need to look up callee from extraction results instead |
| A2 | oxc-transform can inline TS enum member values in isolated segment body text | Issue 2 | May need parent-scope-aware enum resolution instead |
| A3 | `_fnSignal` suppression for component elements can be gated on tag name case | Issue 5 | May need more nuanced component detection |
| A4 | HMR codegen is a localized change to segment-codegen and transform | Issue 6 | May require broader dev-mode infrastructure changes |
| A5 | q:ps unified slot allocation is isolated to the moves_captures test | Issue 7 | May affect other loop-capture tests in Phase 15 |

## Open Questions

1. **TS enum transpilation approach**
   - What we know: Segments reference `Thing.A` which should be `0`. Parent has the enum declaration.
   - What's unclear: Whether running oxc-transform on isolated segment body can resolve enum values, or if the enum declaration must be in scope.
   - Recommendation: Try oxc-transform first. If it can't resolve isolated references, build a simple enum-value-to-const map from the parent and do string replacement.

2. **_rawProps transform completeness**
   - What we know: `applyRawPropsTransform` exists but doesn't handle rest-props or all destructuring patterns.
   - What's unclear: How many patterns need support -- just `...rest` or also renamed props like `count: c`.
   - Recommendation: Examine the 3 affected snapshots exhaustively and extend `applyRawPropsTransform` to cover all patterns found.

3. **HMR scope**
   - What we know: Only 1 test (hmr) requires HMR features. It needs `_useHmr()`, `qrlDEV()`, `componentQrl1` alias, and dev info objects.
   - What's unclear: Whether HMR support is needed for Phase 14 or can be deferred.
   - Recommendation: Implement if time allows; this is a single test with well-defined expected output.

## Phase 14 Specific Snapshot Classification

### Already Passing (3 of 25 -- segments OK)
- **issue_964:** PARENT_OK, SEGS_OK (whitespace/formatting only -- AST comparison passes)
- **rename_builder_io:** PARENT_OK, SEGS_OK
- **root_level_self_referential_qrl:** PARENT_OK, SEGS_OK (missing `//` separator but AST comparison passes)

### Segment Codegen Issues Only (14 of 25)
- example_spread_jsx, example_use_client_effect, example_with_style, hoisted_fn_signal_in_loop
- issue_7216_add_test, moves_captures_when_possible, should_convert_rest_props
- should_destructure_args, should_ignore_passive_jsx_events_without_handlers
- should_make_component_jsx_split_with_bind, should_mark_props_as_var_props_for_inner_cmp
- should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after
- should_merge_bind_checked_and_on_input, should_merge_bind_value_and_on_input

### Parent + Segment Issues (5 of 25)
- example_strip_exports_used (parent: unwanted _auto_ re-export; segment: bare QRL refs, missing useResourceQrl)
- example_ts_enums (parent: let vs var; segment: Thing.A not inlined)
- example_ts_enums_issue_1341 (parent: missing IIFE wrapper; segment: Thing.A not inlined)
- example_ts_enums_no_transpile (parent: leftover original imports; segment: missing Thing import)
- hmr (parent: missing qrlDEV; segment: missing _useHmr)
- should_disable_qwik_transform_error_by_code (parent: unwanted _auto_; segment: comment not stripped)

### Parent Issues Only (1 of 25)
- example_use_server_mount (parent segments have nested call issue)

## Metadata

**Confidence breakdown:**
- Nested marker call fix: HIGH -- clear pattern from rewrite-parent.ts that needs porting
- TS enum transpilation: MEDIUM -- approach depends on oxc-transform capabilities
- _rawProps/restProps: HIGH -- patterns clearly identified from expected output
- Bind merging: HIGH -- array structure clearly visible in expected output
- HMR codegen: MEDIUM -- single test, well-defined but may require broad changes
- q:ps slot allocation: MEDIUM -- complex cross-handler coordination

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase, no external dependencies changing)
