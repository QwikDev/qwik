# Phase 8: Parent Rewrite Batch 2 - Research

**Researched:** 2026-04-10
**Domain:** Qwik optimizer parent module rewriting -- 24 remaining parent-rewrite-only snapshots
**Confidence:** HIGH

## Summary

All 24 Phase 8 target snapshots currently fail. 23/24 have parent-only mismatches (segments already correct), and 1 (`example_strip_client_code`) additionally has a segment metadata mismatch. The failures cluster into 8 distinct pattern categories that can be addressed incrementally.

The infrastructure built in Phase 7 (import assembly, `.s()` body transformation, hoist const-function extraction, JSX transpilation in bodies) is solid and does not need rearchitecting. Phase 8 work is **feature-deep, not infrastructure-wide** -- each failure category requires a specific targeted fix to an existing module.

**Primary recommendation:** Attack failures in order of dependency and blast radius: (1) TypeScript stripping and no-extraction passthrough, (2) capture suppression for `_auto_` migrated variables, (3) signal wrapping (`_wrapProp`/`_fnSignal`) in props and children, (4) `_restProps`/destructuring optimization, (5) `regCtxName`/`_regSymbol` support, (6) `inlinedQrl(null, ...)` passthrough, (7) hoist-to-const pattern for simple bodies.

## Standard Stack

No new libraries needed. Phase 8 uses the same stack established in CLAUDE.md and prior phases:

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| oxc-parser | ^0.124.0 | AST parsing for body transforms | Already installed [VERIFIED: codebase] |
| oxc-transform | ^0.121.0 | TypeScript stripping in parent output | Already installed [VERIFIED: codebase] |
| oxc-walker | ^0.6.0 | AST traversal with scope tracking | Already installed [VERIFIED: codebase] |
| magic-string | ^0.30.21 | Surgical source text replacement | Already installed [VERIFIED: codebase] |
| vitest | ^4.1.4 | Test runner | Already installed [VERIFIED: codebase] |

## Architecture Patterns

### Existing Infrastructure (from Phase 7)

The following modules are already wired and working. Phase 8 adds features within them, not new modules:

| Module | Purpose | Phase 8 Changes Needed |
|--------|---------|----------------------|
| `src/optimizer/rewrite-parent.ts` | Parent module rewriting engine | Add TS stripping for transpileTs, capture suppression, hoist-to-const pattern |
| `src/optimizer/transform.ts` | Public API, wires everything together | Wire regCtxName, improve inlinedQrl passthrough |
| `src/optimizer/signal-analysis.ts` | Signal/store expression detection | Add children-position analysis, _rawProps pattern |
| `src/optimizer/inline-strategy.ts` | _noopQrl + .s() builders | Minor tweaks for hoist-to-const pattern |
| `src/optimizer/jsx-transform.ts` | JSX -> _jsxSorted/_jsxSplit | Signal wrapping in children, whitespace normalization |
| `src/optimizer/capture-analysis.ts` | Capture detection | Suppress captures for _auto_ migrated variables |
| `src/optimizer/strip-ctx.ts` | Client/server code stripping | Already works; strip_client_code segment metadata fix |

### Failure Category Analysis

Based on exhaustive diagnostic runs comparing all 24 snapshots' expected vs actual output:

#### Category 1: TypeScript Not Stripped from Parent Output (6 snapshots)

**Affected:** `should_not_move_over_side_effects`, `example_transpile_ts_only`, `example_use_optimization`, `should_keep_module_level_var_used_in_both_main_and_qrl`, and 4 `should_keep_*_destructuring_*` tests, `should_keep_root_var_*` tests

**Problem:** When `transpileTs: true`, the expected parent output has TS types stripped (`(ref)` not `(ref: SeenRef)`, no `as string` casts). Our optimizer preserves the original source text unchanged via magic-string. Rust's output reprints AST without types.

**Fix:** After magic-string produces the parent output, run `oxcTransformSync()` to strip TS types from the final parent code when `transpileTs: true`. This is the same approach already used for hoist body text in Phase 7 Plan 05. [VERIFIED: rewrite-parent.ts line 22 already imports oxcTransformSync]

**Confidence:** HIGH -- pattern already proven in hoist body stripping.

#### Category 2: Capture `.w()` Not Suppressed for `_auto_` Migrated Variables (7 snapshots)

**Affected:** `should_keep_module_level_var_used_in_both_main_and_qrl`, `should_keep_root_var_used_by_export_decl_and_qrl`, `should_keep_root_var_used_by_exported_function_and_qrl`, 4x `should_keep_non_migrated_binding_from_shared_destructuring_*`

**Problem:** When a variable is migrated via `_auto_` export (e.g., `export { state as _auto_state }`), the Rust optimizer does NOT generate `.w([state])` on the QRL reference because the variable is already made available to segments via the `_auto_` mechanism. Our optimizer still emits `.w([state])` because capture analysis doesn't know about migration decisions.

**Expected:** `export const handler = q_handler_T7IDIUVU4lI;` (no `.w()`)
**Actual:** `export const handler = q_handler_T7IDIUVU4lI.w([shared]);` (incorrect `.w()`)

**Fix:** In `rewrite-parent.ts` Step 4b (`.w()` wrapping), filter out capture names that correspond to `_auto_` migrated variables. The `migrationDecisions` array is already passed to `rewriteParentModule()`.

**Confidence:** HIGH -- data is already available, just not used for filtering.

#### Category 3: Signal Wrapping in Props and Children (`_wrapProp`, `_fnSignal`, `_rawProps`) (5 snapshots)

**Affected:** `example_props_wrapping`, `example_props_wrapping2`, `example_props_wrapping_children`, `example_props_wrapping_children2`, `fun_with_scopes`

**Problem:** The Rust optimizer detects signal-reactive expressions in JSX props AND children and transforms them:
- `props.field` in prop value -> `_wrapProp(props, "field")`
- `expr + props.field` in prop value -> `_fnSignal(_hfN, [props, ...], "expr_str")`
- Destructured `{ fromProps }` params -> `_rawProps` parameter + `_wrapProp(_rawProps, "fromProps")`
- Same patterns in JSX children position -> same transforms

Our optimizer only handles signal analysis in props position, not children. And does not implement the `_rawProps` destructuring optimization.

**Fix components:**
1. Extend `signal-analysis.ts` to analyze children array expressions (not just prop values)
2. Implement `_rawProps` parameter transformation: when component param is destructured `({ field })`, change to `(_rawProps)` and generate `_wrapProp(_rawProps, "field")` for reactive references
3. Generate `_hfN`/`_hfN_str` hoisted function declarations in parent module preamble
4. The `_fnSignal` import and hoisted declarations need to be added to the import assembly

**Confidence:** MEDIUM -- signal analysis architecture exists but children-position and `_rawProps` are substantial new features. This is the largest single category.

#### Category 4: Non-User Import Preservation (`issue_476`) (1 snapshot)

**Affected:** `issue_476`

**Problem:** Uses `entry=segment`, `transpileTs=false`, `transpileJsx=false`. The input imports `Counter` from `"./counter.tsx"`. Expected output preserves this import. Our actual output strips it because no `$()` markers exist and the import stripping logic removes it.

**Expected:** `import { Counter } from "./counter.tsx";`
**Actual:** Import missing entirely.

**Fix:** When no extractions exist and `entryStrategy=segment`, pass through the source with only the `//` separator added. Non-marker imports should not be stripped when there are no markers to strip.

**Confidence:** HIGH -- simple passthrough fix.

#### Category 5: `inlinedQrl(null, ...)` Passthrough (1 snapshot)

**Affected:** `should_ignore_null_inlined_qrl`

**Problem:** Input contains `const foo = inlinedQrl(null, 'some_hash')`. Expected output strips the `const foo =` binding and emits just `inlinedQrl(null, 'some_hash');`. Our optimizer doesn't recognize pre-existing `inlinedQrl()` calls as already-optimized code.

**Fix:** Detect `inlinedQrl` calls in the input and pass them through without extraction. The unused binding removal logic (Step 4a in rewrite-parent.ts) should handle stripping `const foo =` if the variable is unreferenced.

**Confidence:** HIGH -- the binding removal mechanism exists; just needs the `inlinedQrl` call to not be misidentified.

#### Category 6: `regCtxName` / `_regSymbol` Support (2 snapshots)

**Affected:** `example_reg_ctx_name_segments_hoisted`, `example_reg_ctx_name_segments_inlined`

**Problem:** The `regCtxName` option (set to `['server']`) tells the optimizer to wrap certain function bodies with `_regSymbol()` and use `serverQrl()` instead of plain QRL references. Our optimizer accepts the option in types but never implements the behavior.

**Expected output includes:**
- `import { _regSymbol } from "@qwik.dev/core";`
- `import { serverQrl } from "@qwik.dev/core";`
- `.s(/*#__PURE__*/ _regSymbol(() => body, "hash"))` for server-tagged extractions
- `serverQrl(q_varName)` instead of plain `q_varName` in call sites

**Fix:** Implement `regCtxName` processing: when an extraction's callee name ends with one of the `regCtxName` values (e.g., `server$` matches `server`), wrap the body in `_regSymbol()` and use the corresponding `Qrl` variant in call sites.

**Confidence:** MEDIUM -- new feature, but pattern is clear from snapshot comparison.

#### Category 7: Hoist-to-Const Pattern for Bodies Without Captures (2 snapshots)

**Affected:** `inlined_qrl_uses_identifier_reference_when_hoisted_snapshot`, `should_not_generate_conflicting_props_identifiers`

**Problem:** When using inline strategy and a body has no captures (or uses `_captures`), the Rust optimizer hoists the body as a `const SymbolName = () => { ... }` and then calls `.s(SymbolName)` referencing the const name. Our optimizer always inlines the body directly in `.s(() => { ... })`.

**Expected:**
```js
const App_component_ckEPmXZlub0 = () => { return _jsxSorted(...) };
q_App_component_ckEPmXZlub0.s(App_component_ckEPmXZlub0);
```

**Actual:**
```js
q_App_component_ckEPmXZlub0.s(() => { return _jsxSorted(...) });
```

**Fix:** The hoist const-function pattern already exists in `inline-strategy.ts` (`buildHoistConstDecl`, `buildHoistSCall`). The issue is that `rewrite-parent.ts` only uses it for `entryType: 'hoist'`, not for all extractions that qualify. Need to apply hoist-to-const pattern for inline strategy too, specifically for extractions whose body uses `_captures` or has complex body content.

**Confidence:** HIGH -- infrastructure exists, just needs broader application rules.

#### Category 8: `example_qwik_react_inline` -- Complex Inline with No JSX Transpilation (1 snapshot)

**Affected:** `example_qwik_react_inline`

**Problem:** Uses `entry=inline`, `transpileJsx=false`. The expected output uses `_noopQrl` declarations and `.s()` calls. Our output incorrectly keeps `inlinedQrl()` calls and doesn't transform to the expected pattern. The input contains `component$`, `useTask$` markers that should be extracted.

The actual output still shows `componentQrl(inlinedQrl(...))` instead of `componentQrl(q_symbolName)`. This suggests the extraction is happening but the inline/hoist strategy is not kicking in for this particular combination.

**Fix:** Debug why inline strategy is not applied. Likely an options threading issue where `transpileJsx=false` causes a code path skip.

**Confidence:** MEDIUM -- needs debugging to confirm root cause.

#### Category 9: `example_strip_client_code` -- Strip + Event Handler Segment Metadata (1 snapshot)

**Affected:** `example_strip_client_code`

**Problem:** Two issues: (1) parent output differences (missing imports like `_wrapProp`, `_captures`, `"./keep"`, `"../keep2"`), and (2) segment metadata mismatch for `Parent_component_div_shouldRemove_EBj69wTX1do`. The `stripCtxName: ['useClientMount$']` and `stripEventHandlers: true` options are in play.

The expected output keeps side-effect imports (`"./keep"`, `"../keep2"`) but strips `"../../remove"`. Our output strips all non-Qwik imports. Also, event handler segments that should be stripped still need correct metadata.

**Fix:** Preserve side-effect imports that don't match a strip pattern. Fix segment naming for stripped event handlers.

**Confidence:** MEDIUM -- multiple interacting features.

### Phase 7 Overlap Analysis

The Phase 7 VERIFICATION.md lists 17 unfixed snapshots. These overlap with Phase 8 in the following pattern categories:

| Phase 7 Blocker | Phase 8 Category | Overlapping Mechanism |
|----------------|------------------|----------------------|
| Signal wrapping in children | Category 3 | Same `_wrapProp`/`_fnSignal` in children position |
| `_fnSignal` hoisting | Category 3 | Same `_fnSignal` hoisted function pattern |
| Destructuring optimization (`_rawProps`) | Category 3 | Same `_rawProps` parameter transformation |
| Symbol naming context stack | Not in Phase 8 | Phase 7-only issue (Cmp_p prefix) |
| `inlinedQrl()` format | Category 5 | Same pre-inlined code passthrough |
| `.s()` call placement ordering | Category 7 | Related to hoist-to-const ordering |
| Aliased import resolution | Not in Phase 8 | Phase 7-only issue |
| Loop context flags | Not in Phase 8 | Phase 7-only issue |

**Key insight:** Fixing Phase 8 Category 3 (signal wrapping) will also unblock 7+ Phase 7 snapshots (`derived_signals_*`, `mutable_children`, `input_bind`, `issue_33443`, `issue_4438`). Fixing Category 2 (capture suppression) may also help Phase 7 snapshots. The planner should prioritize Category 3 work knowing it has outsized impact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript stripping | Regex-based type removal | `oxcTransformSync()` from oxc-transform | Handles all TS syntax edge cases; already imported in rewrite-parent.ts [VERIFIED: codebase] |
| JSX text whitespace | Custom whitespace rules | Rust optimizer whitespace algorithm | Must match Rust exactly; study snapshot pairs for rules |
| Signal expression detection | Simple regex | Existing `analyzeSignalExpression()` in signal-analysis.ts | Already handles props position; extend for children [VERIFIED: codebase] |

## Common Pitfalls

### Pitfall 1: TS Stripping Position Shift
**What goes wrong:** Running `oxcTransformSync()` on the final parent output changes character positions, breaking magic-string range references if any are still pending.
**Why it happens:** TS stripping removes type annotations, shifting all subsequent text positions.
**How to avoid:** Run TS stripping as the LAST step after all magic-string operations are complete, operating on the final `s.toString()` output rather than the magic-string instance.
**Warning signs:** Tests fail with "index out of range" or garbled output.

### Pitfall 2: Capture Suppression vs Migration
**What goes wrong:** Suppressing `.w()` for migrated variables breaks segments that genuinely need the capture.
**Why it happens:** A variable can be both migrated (`_auto_`) AND captured. The migration makes it available via `_auto_` import in the segment, so `.w()` is redundant but not harmful. The Rust optimizer omits `.w()` when `_auto_` is present.
**How to avoid:** Only suppress `.w()` captures that have a corresponding `_auto_` export. Check `migrationDecisions` for exact variable names.
**Warning signs:** Segment code references a variable that's not available at runtime.

### Pitfall 3: `_rawProps` Requires Full Parameter Rewrite
**What goes wrong:** Partially implementing `_rawProps` (e.g., only renaming the parameter) without also updating all references to destructured fields.
**Why it happens:** The `_rawProps` pattern requires: (1) replacing destructured `{ field }` with `_rawProps`, (2) generating `_wrapProp(_rawProps, "field")` for reactive references, (3) keeping direct `field` references for non-reactive uses.
**How to avoid:** Implement as a complete transform: parameter rewrite + reference rewrite + signal wrapping in a single pass.
**Warning signs:** Runtime errors where destructured variables are undefined.

### Pitfall 4: Side-Effect Import Preservation Under Strip
**What goes wrong:** Stripping server/client code also strips side-effect imports (`import "./keep"`) that should be preserved.
**Why it happens:** Import stripping logic treats all imports uniformly when strip options are active.
**How to avoid:** Side-effect imports (those with no specifiers) should always be preserved unless they match a specific strip pattern (e.g., `"../../remove"` matches a removal depth heuristic or explicit strip list).
**Warning signs:** `import "./keep"` missing from output.

### Pitfall 5: Hoist-to-Const Application Rules
**What goes wrong:** Applying hoist-to-const to all extractions, including those with inline captures that should stay in `.s()` directly.
**Why it happens:** The Rust optimizer has specific rules about when to hoist vs inline.
**How to avoid:** Study the two snapshots (`inlined_qrl_uses_identifier_reference_when_hoisted_snapshot` and `should_not_generate_conflicting_props_identifiers`) to extract the exact rules. Likely: hoist when body uses `_captures`, or when body is a component with complex content.
**Warning signs:** Extra const declarations that shouldn't exist, or missing ones.

## Code Examples

### TS Stripping as Final Step
```typescript
// Source: rewrite-parent.ts existing pattern (hoist body stripping)
// [VERIFIED: src/optimizer/rewrite-parent.ts line 22]
import { transformSync as oxcTransformSync } from 'oxc-transform';

// After s.toString() produces final code:
let finalCode = s.toString();
if (transpileTs) {
  const stripped = oxcTransformSync('output.tsx', finalCode, { typescript: { onlyRemoveTypeImports: false } });
  finalCode = stripped.code;
}
```

### Capture Suppression for Migrated Variables
```typescript
// [ASSUMED] -- pattern derived from snapshot analysis
// In Step 4b of rewrite-parent.ts:
const migratedNames = new Set(
  (migrationDecisions ?? [])
    .filter(d => d.action === 'migrate')
    .map(d => d.name)
);

for (const ext of topLevel) {
  if (ext.isSync) continue;
  // Filter out migrated variables from captures
  const effectiveCaptures = ext.captureNames.filter(name => !migratedNames.has(name));
  if (effectiveCaptures.length === 0) continue;
  // ... build .w() with effectiveCaptures only
}
```

### _regSymbol Wrapping
```typescript
// [ASSUMED] -- pattern derived from snapshot comparison
// For regCtxName-matched extractions:
// Body: /*#__PURE__*/ _regSymbol(() => console.log('in server', 'hola'), "q39lOt7xGrI")
// Call site: serverQrl(q_Works_component_div_q_e_click_server_q39lOt7xGrI)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Body always inline in .s() | Hoist-to-const for qualifying extractions | Phase 7 Plan 05 | Matches Rust optimizer behavior for hoist strategy |
| TS types in magic-string output | oxcTransformSync strips types | Phase 7 Plan 05 (hoist only) | Need to extend to full parent output |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Capture suppression: migrated `_auto_` variables should be excluded from `.w()` | Category 2 | Medium -- wrong captures cause runtime errors |
| A2 | `_rawProps` pattern triggered by destructured component params with signal-reactive references | Category 3 | High -- wrong trigger rules break all props wrapping |
| A3 | `_regSymbol` wrapping rule: callee name contains a `regCtxName` value | Category 6 | Medium -- wrong matching rule produces incorrect wrapping |
| A4 | Hoist-to-const for inline strategy triggered by `_captures` usage or complex body | Category 7 | Low -- worst case is formatting difference |
| A5 | Side-effect import preservation: `import "./keep"` kept, `import "../../remove"` stripped based on depth or explicit list | Category 9 | Medium -- wrong imports cause runtime issues |

## Open Questions

1. **`_rawProps` Trigger Rules**
   - What we know: Destructured component params like `({ fromProps })` become `(_rawProps)` with `_wrapProp(_rawProps, "fromProps")` for reactive references
   - What's unclear: Exact rules for when to apply `_rawProps` vs keeping destructured params. Does it only apply when signal wrapping is needed? What about rest patterns (`{ color, ...rest }`)?
   - Recommendation: Study the 5 props_wrapping snapshots and `should_not_generate_conflicting_props_identifiers` for exact trigger conditions

2. **Side-Effect Import Stripping Criteria**
   - What we know: `import "./keep"` and `import "../keep2"` are preserved, `import "../../remove"` is stripped in `example_strip_client_code`
   - What's unclear: Is the stripping based on import path depth, or on whether the imported module contains client/server code, or something else?
   - Recommendation: Check the Rust optimizer source for `strip_client_code` test to understand the exact rule

3. **Hoist-to-Const vs Inline Decision**
   - What we know: `inlined_qrl_uses_identifier_reference_when_hoisted_snapshot` hoists a simple body, `should_not_generate_conflicting_props_identifiers` hoists bodies with `_captures`
   - What's unclear: Exact criteria for when Rust optimizer chooses hoist-to-const vs direct inline in `.s()`
   - Recommendation: Default to hoist-to-const for all non-stripped extractions in inline strategy, matching the majority pattern

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts -t "SNAPSHOT_NAME"` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | All 24 Phase 8 snapshots pass | convergence | `npx vitest run tests/optimizer/convergence.test.ts` | Yes |
| SC-2 | Phase 7 locked snapshots still pass | convergence | Same as above | Yes |
| SC-3 | Zero unit test regressions | unit | `npx vitest run` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "SNAPSHOT_NAME"` (target snapshot)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements.

## Security Domain

Not applicable -- this is a build-time code transformation tool with no authentication, sessions, access control, or network-facing surface. Security enforcement is not relevant.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/optimizer/rewrite-parent.ts`, `src/optimizer/transform.ts`, `src/optimizer/signal-analysis.ts`, `src/optimizer/inline-strategy.ts` -- current implementation state
- Snapshot diagnostic runs: all 24 Phase 8 snapshots compared expected vs actual output

### Secondary (MEDIUM confidence)
- Phase 7 VERIFICATION.md -- root cause analysis of 17 unfixed Phase 7 snapshots
- Phase 7 Plan 05 SUMMARY.md -- hoist-to-const pattern and JSX child flag decisions

### Tertiary (LOW confidence)
- Rust optimizer behavior inferred from snapshot pairs (not directly verified against Rust source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no changes needed, all libraries already in use
- Architecture: HIGH -- all failure categories identified from actual diagnostic comparison
- Pitfalls: MEDIUM -- some assumptions about Rust optimizer decision rules
- Failure categories: HIGH -- every snapshot compared expected vs actual

**Research date:** 2026-04-10
**Valid until:** 2026-04-24 (14 days -- active development, categories may shift as fixes land)
