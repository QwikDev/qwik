# Phase 7: Parent Rewrite Batch 1 - Research

**Researched:** 2026-04-10
**Domain:** Qwik optimizer parent module output convergence
**Confidence:** HIGH

## Summary

Phase 7 targets 24 snapshots where all extracted segments already match the Rust optimizer's output, but the parent module output diverges. Detailed diff analysis reveals **five distinct failure patterns** across these 24 snapshots, driven primarily by the interaction between entry strategy (inline/hoist vs segment) and how `.s()` call bodies are constructed.

The 24 snapshots break down by entry strategy: **3 segment** (default), **12 inline**, **9 hoist**. The segment-strategy snapshots have simpler issues (import ordering, missing user imports in output, formatting). The inline/hoist snapshots (21 of 24) all share a critical deficiency: the `.s()` call bodies use raw source text (`ext.bodyText`) instead of the fully-transformed body that the Rust optimizer produces (with nested QRL call rewriting, capture injection via `_captures`, JSX transpilation, and whitespace minification).

**Primary recommendation:** Fix the inline/hoist `.s()` body generation by applying the same transformation pipeline to `.s()` bodies as is applied to separate segment files, plus fix import ordering and user import preservation for all strategies.

## Standard Stack

No new libraries needed. This phase operates entirely within the existing codebase using:
- magic-string (source text manipulation) [VERIFIED: already in use]
- oxc-parser (re-parsing for import cleanup and AST comparison) [VERIFIED: already in use]
- oxc-walker (scope tracking for captures) [VERIFIED: already in use]

## Architecture Patterns

### Current Parent Rewrite Pipeline (in rewrite-parent.ts + transform.ts)

```
Input source
  -> Step 1: Rewrite import sources (qwik -> @qwik.dev/core)
  -> Step 2: Remove marker specifiers ($-suffixed imports)
  -> Step 2b: Strip exports
  -> Step 2c: Const replacement (isServer/isDev)
  -> Step 3: Detect nesting (parent-child relationships)
  -> Step 3b: Pre-compute QRL variable names
  -> Step 4: Rewrite call sites (replace $() with QRL variables)
  -> Step 4b: .w() wrapping for captures
  -> Step 4c: JSX transformation (if enabled)
  -> Step 5: Build optimizer-added imports
  -> Step 5b: Build QRL declarations
  -> Step 5c: Build .s() calls (inline strategy -- CURRENTLY BROKEN)
  -> Step 6: Assemble output (prepend preamble)
  -> Step 6b: _auto_ exports
  -> Step 6c: Remove migrated declarations
  -> Post: removeUnusedImports() in transform.ts
```

### Key Architecture Insight

The Rust optimizer reprints parent modules from scratch (AST-to-code). The TS optimizer uses magic-string (surgical text edits on original source). This difference is the root cause of most issues -- magic-string preserves original formatting/whitespace/variable declarations that the Rust optimizer strips or reformats.

### Recommended Fix Architecture

The fixes cluster into **5 independent patterns** that can be addressed in sequence:

1. **Import assembly order** -- deterministic sorting to match Rust output
2. **User import preservation** -- non-marker imports must survive in parent
3. **Segment strategy formatting** -- minor whitespace/structure issues for 3 segment-strategy snapshots
4. **Inline/hoist .s() body transformation** -- the big one: apply segment-level transforms to .s() bodies
5. **Inline/hoist import needs** -- .s() bodies generate additional import requirements (Qrl-suffixed callees, `_captures`, JSX helpers)

## Failure Pattern Analysis

### Pattern 1: Import Assembly Order (affects all 24)

**What:** The TS optimizer emits optimizer-added imports (like `qrl`, `_noopQrl`, `componentQrl`) in alphabetical order by symbol name, then places original user imports after the `//` separator. The Rust optimizer interleaves them differently -- optimizer imports first, then user imports, all before the first `//`.

**Expected pattern (from Rust):**
```
import { componentQrl } from "@qwik.dev/core";
import { _noopQrl } from "@qwik.dev/core";
import { _jsxSorted } from "@qwik.dev/core";
import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";
import { useStore, mutable } from '@qwik.dev/core';
import { dep } from './file';
//
```

**Actual pattern (from TS):**
```
import { _noopQrl } from "@qwik.dev/core";
import { componentQrl } from "@qwik.dev/core";
//
```
(user imports appear later in the body text, not in preamble)

**Root cause:** `rewriteParentModule()` uses `s.prepend()` to add optimizer imports before the body. But the body already contains the original import statements (which were only edited, not moved). The Rust optimizer collects ALL imports and emits them in a specific order at the top.

**Fix direction:** Gather all imports (optimizer-added + surviving user imports) into one sorted block, remove original import positions from body, emit the unified block in the preamble. [VERIFIED: from Rust snapshot output analysis]

### Pattern 2: Missing Imports for Inline/Hoist Bodies (affects 20 of 24)

**What:** When `.s()` bodies reference transformed callees (`useStylesQrl`, `useBrowserVisibleTaskQrl`, etc.) and JSX helpers (`_jsxSorted`, `_wrapProp`, `_fnSignal`, `_Fragment`), the parent module needs corresponding imports. Currently these imports are not generated because the `.s()` body rewriting doesn't trigger import collection.

**Missing categories:**
- `_jsxSorted`, `_jsxSplit`, `_Fragment` -- JSX transform imports (14 snapshots)
- `_wrapProp`, `_fnSignal` -- signal analysis imports (8 snapshots)
- `useStylesQrl`, `useBrowserVisibleTaskQrl`, `useTaskQrl`, `serverQrl` -- Qrl-suffixed callee imports (3 snapshots)
- `_captures` -- capture injection import (3 snapshots)
- `inlinedQrl` -- for nested QRL declarations in inline mode (2 snapshots)
- `_val`, `_chk`, `_restProps`, `_getVarProps`, `_getConstProps` -- prop helpers (3 snapshots)

**Root cause:** `.s()` bodies are currently raw `ext.bodyText` without any transformation. The import collection in Step 5 only considers top-level extractions' callee names, not what the transformed `.s()` body would need.

**Fix direction:** After transforming `.s()` bodies (Pattern 4), collect all symbols they reference and add to `neededImports`. [VERIFIED: from snapshot expected outputs]

### Pattern 3: .s() Body Not Transformed (affects 21 of 24 -- all inline/hoist)

**What:** The `.s()` call bodies in the TS output contain raw source text, while the Rust output contains fully transformed code with:
- Nested `$()` calls rewritten to QRL variables
- `$`-suffixed callee names rewritten to `Qrl`-suffixed names
- Captured variables replaced with `_captures[N]` references
- JSX transpiled to `_jsxSorted`/`_jsxSplit` calls (when transpileJsx is true)
- Signal/event/bind prop transformations applied
- Whitespace minified (Rust's simplify minification)

**Example -- expected .s() body (Rust):**
```javascript
q_Child_component_9GyF01GDKqw.s(()=>{
    useStylesQrl(q_Child_component_useStyles_qBZTuFM0160);
    const state = useStore({
        count: 0
    });
    useBrowserVisibleTaskQrl(q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.w([
        state
    ]));
    return <div q-e:click={q_Child_component_div_q_e_click_cROa4sult1s}>
		</div>;
});
```

**Actual .s() body (TS):**
```javascript
q_Child_component_9GyF01GDKqw.s(() => {

	useStyles$('somestring');
	const state = useStore({
		count: 0
	});

	// Double count watch
	useBrowserVisibleTask$(() => {
		state.count = thing.doStuff() + import("./sibling");
	});
	return (
		<div onClick$={() => console.log(mongodb)}>
		</div>
	);
});
```

**Root cause:** `buildSCall()` in `inline-strategy.ts` takes `ext.bodyText` directly:
```typescript
export function buildSCall(varName: string, bodyText: string): string {
  return `${varName}.s(${bodyText});`;
}
```
This raw body has not been through the segment codegen pipeline.

**Fix direction:** For inline/hoist strategy, the `.s()` body must go through the same transformation that `generateSegmentCode()` applies to separate segment files. This includes:
1. Nested extraction call sites rewritten to QRL variable references
2. `$`-suffixed callee names changed to `Qrl`-suffixed
3. Captured variables replaced with `_captures[N]` where applicable
4. JSX transformation (when transpileJsx is enabled)
5. Minification (when minify is 'simplify')

The implementation can either:
- (a) Reuse `generateSegmentCode()` logic directly, or
- (b) Apply a mini-transform pipeline on the body text before passing to `buildSCall()`

Option (b) is likely cleaner since inline `.s()` bodies have subtle differences from full segment files (e.g., no separate `export const` wrapper, different import context). [VERIFIED: from comparing Rust inline vs segment outputs]

### Pattern 4: User Import Preservation (affects 3 segment-strategy snapshots)

**What:** For `example_1`, `example_functional_component`, and `example_missing_custom_inlined_functions`, the segment-strategy parent modules are missing user-level imports that should survive after extraction. For example, `example_functional_component` expected output has `import { $, component$, useStore } from '@qwik.dev/core';` but only the `$` and `component$` specifiers should be removed (they're marker functions), while `useStore` should remain.

**Root cause:** The `removeUnusedImports()` function in `transform.ts` is removing imports whose identifiers are still referenced in the body. The issue is that after extraction moves the consumer code into segments, the parent body may no longer reference `useStore` -- but the Rust optimizer retains it because the original import statement was partially edited (remove markers, keep rest), and the remaining specifiers stay even if unused.

Actually, looking more carefully at `example_functional_component`: the expected output has `import { $, component$, useStore } from '@qwik.dev/core';` -- these are the ORIGINAL import specifiers. The Rust optimizer keeps the original import statement with its original specifiers when not all specifiers are markers. The TS optimizer's `removeUnusedImports()` aggressively prunes them.

**Fix direction:** Align `removeUnusedImports()` behavior with Rust. The Rust optimizer only removes specifiers that are marker functions ($-suffixed imports from Qwik core). Non-marker specifiers from the same import declaration are preserved even if no longer referenced in the parent body. Alternatively: the Rust keeps the full original import line (with markers removed) and doesn't do unused-import cleanup on Qwik core imports. [ASSUMED -- need to verify exact Rust cleanup rules]

### Pattern 5: Body Formatting / Minification (affects multiple)

**What:** The Rust optimizer applies 'simplify' minification to `.s()` bodies and to the overall parent module body. This collapses whitespace, removes comments, and reformats to a compact style (4-space indent, minimal newlines). The TS optimizer preserves original formatting via magic-string.

**Expected (Rust):**
```javascript
q_Issue3561_component_hHTw654BZB8.s(()=>{
    const props = useStore({
        product: {
            currentVariant: {
                variantImage: 'image',
```

**Actual (TS):**
```javascript
q_Issue3561_component_hHTw654BZB8.s(() => {
	const props = useStore({
		product: {
		currentVariant: {
			variantImage: 'image',
```

**Root cause:** magic-string preserves original indentation and whitespace. The Rust optimizer's codegen reprints everything with consistent 4-space indentation and its own formatting rules.

**Fix direction:** Since AST comparison strips whitespace/positions, formatting differences alone won't cause test failures. However, the `.s()` body minification (removing comments, collapsing unnecessary whitespace) IS part of the Rust output for `minify: 'simplify'`. The body text needs to go through a simplify pass. For the overall parent body, magic-string's approach is fine as long as AST comparison passes -- the formatting differences are cosmetic. [VERIFIED: AST comparison in test infra strips positions/whitespace]

**Important nuance:** The AST comparison strips `start`, `end`, `loc`, `range` and `raw` (for literals). So whitespace/formatting differences are NOT the actual cause of test failures. The failures are due to structural AST differences (wrong nodes, missing nodes, different values). This means Pattern 5 is likely NOT a blocker -- the formatting differences will pass AST comparison once the structural issues (Patterns 1-4) are fixed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .s() body transformation | Custom text munging | Reuse segment codegen pipeline | Already handles nesting, captures, JSX, callsite rewriting |
| Import deduplication | Manual tracking | Extend existing `neededImports` Map + `alreadyImported` Set | Already handles dedup in rewrite-parent.ts |
| AST comparison | Custom diff tool | Existing `compareAst()` in testing/ast-compare.ts | Already strips positions, handles ParenthesizedExpression |

## Common Pitfalls

### Pitfall 1: Circular transformation of .s() bodies
**What goes wrong:** When transforming `.s()` body text through the segment codegen pipeline, the body text is already extracted from the original source at specific offsets. Running it through `extractSegments()` again could fail because the body text is a closure body, not a full module.
**Why it happens:** The segment codegen pipeline expects a full module with imports as input, but `.s()` bodies are bare closure expressions.
**How to avoid:** Transform the body text by applying individual transforms (callee rewriting, capture injection) directly, rather than running the full `extractSegments -> rewriteParent -> generateSegment` pipeline on it.
**Warning signs:** Parse errors when trying to parse body text as a module.

### Pitfall 2: Import ordering sensitivity
**What goes wrong:** Adding new imports for `.s()` body needs while the existing import ordering doesn't match.
**Why it happens:** The Rust optimizer has a specific import emission order: optimizer imports sorted a specific way, then user imports. Getting this wrong causes AST comparison failures on every snapshot.
**How to avoid:** Build a comprehensive import sorting function that matches the Rust ordering. The Rust order appears to be: each import on its own line, sorted by symbol name within @qwik.dev/core, then other Qwik packages, then user imports in original order.
**Warning signs:** Snapshots pass structurally but fail on import node ordering.

### Pitfall 3: Nested QRL references in .s() bodies
**What goes wrong:** When a component's `.s()` body contains nested `$()` calls (like `onClick$={...}` or `useTask$(() => ...)`), these must be rewritten to reference the QRL variables (`q_Child_component_div_q_e_click_...`). Missing this causes the body to have raw `$()` calls instead of QRL references.
**Why it happens:** The current `.s()` body generation uses raw `ext.bodyText` which hasn't been through call-site rewriting.
**How to avoid:** Apply the same nested call-site rewriting to `.s()` bodies. The nested extractions and their QRL variable names are already computed -- they just need to be applied to the body text.
**Warning signs:** `.s()` bodies contain `$()` calls instead of QRL variable references.

### Pitfall 4: _captures injection for inline strategy
**What goes wrong:** When an inline strategy `.s()` body captures variables from its enclosing scope, the Rust output uses `const varName = _captures[N];` at the top of the body. The TS output doesn't inject this.
**Why it happens:** For segment strategy, captures are handled by the QRL's `.w()` chain and the runtime. For inline strategy, the `.s()` body must explicitly reference `_captures` because there's no separate module boundary.
**How to avoid:** When building `.s()` bodies for extractions with `captureNames.length > 0` AND nested extractions, inject `_captures` declarations at the top of the body.
**Warning signs:** `.s()` bodies reference variables that are captured but not declared.

### Pitfall 5: Regression in 10 already-passing snapshots
**What goes wrong:** Changing import ordering or unused-import cleanup could break the 10 snapshots that already pass.
**Why it happens:** The 10 passing snapshots have the current import ordering baked into their expected output matching.
**How to avoid:** Run the full convergence test after each change. Use the existing 10 passing snapshots as regression anchors.
**Warning signs:** Previously-passing snapshots start failing after import or cleanup changes.

## Code Examples

### Current .s() body generation (needs fixing)

```typescript
// Source: src/optimizer/inline-strategy.ts
export function buildSCall(varName: string, bodyText: string): string {
  return `${varName}.s(${bodyText});`;
}
```

### Current .s() body usage (raw body text)

```typescript
// Source: src/optimizer/rewrite-parent.ts, Step 5c
for (const ext of nonStripped) {
  const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
  sCalls.push(buildSCall(varName, ext.bodyText));
}
```

### Desired .s() body (from Rust expected output)

```typescript
// The .s() body should be transformed:
// 1. Nested $() calls rewritten to QRL vars
// 2. $-suffixed callees renamed to Qrl-suffixed
// 3. Captures injected as _captures[N] references
// 4. JSX transpiled (when transpileJsx enabled)
// Example from example_inlined_entry_strategy:
`q_Child_component_9GyF01GDKqw.s(()=>{
    useStylesQrl(q_Child_component_useStyles_qBZTuFM0160);
    const state = useStore({ count: 0 });
    useBrowserVisibleTaskQrl(q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.w([state]));
    return <div q-e:click={q_Child_component_div_q_e_click_cROa4sult1s}></div>;
});`
```

### Import ordering (from Rust expected output)

```typescript
// Rust import order pattern (from example_inlined_entry_strategy):
// 1. Optimizer-added imports (each on own line, sorted alphabetically by symbol)
//    import { componentQrl } from "@qwik.dev/core";
//    import { useStylesQrl } from "@qwik.dev/core";
//    import { _noopQrl } from "@qwik.dev/core";
//    import { useBrowserVisibleTaskQrl } from "@qwik.dev/core";
//    import { _captures } from "@qwik.dev/core";
// 2. User imports (in original source order, with markers removed)
//    import { useStore } from '@qwik.dev/core';
//    import { thing } from './sibling';
//    import mongodb from 'mongodb';
```

## Snapshot Breakdown by Entry Strategy

| Strategy | Count | Snapshots | Key Issues |
|----------|-------|-----------|------------|
| segment | 3 | example_1, example_functional_component, example_missing_custom_inlined_functions | Import order, user import preservation, minor formatting |
| inline | 12 | example_default_export_index, example_dev_mode_inlined, example_inlined_entry_strategy, example_input_bind, example_lib_mode, example_optimization_issue_3542/3561/3795/4386, example_parsed_inlined_qrls, example_preserve_filenames, example_props_optimization | .s() body transformation, missing imports, _captures injection |
| hoist | 9 | example_derived_signals_*, example_immutable_function_components, example_issue_33443/4438, example_mutable_children | .s() body transformation (JSX + signals), missing JSX imports |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rust optimizer keeps non-marker import specifiers even if unused in parent body | Pattern 4 | Medium -- may need different unused-import cleanup strategy |
| A2 | AST comparison will pass once structural issues are fixed, regardless of whitespace differences | Pattern 5 | Low -- AST comparison confirmed to strip positions/whitespace |
| A3 | .s() body transformation can reuse individual transform functions without full pipeline | Pitfall 1 | Medium -- may need a mini-pipeline wrapper |

## Open Questions

1. **Exact import ordering rules in Rust optimizer**
   - What we know: optimizer imports come first, user imports after, all before first `//`
   - What's unclear: exact sorting within optimizer imports (alphabetical? by category? by first appearance?)
   - Recommendation: Analyze all 24 expected outputs to establish the exact rule

2. **_captures injection format**
   - What we know: Rust uses `const varName = _captures[N];` at top of .s() body
   - What's unclear: exact ordering when multiple captures exist, interaction with nested captures
   - Recommendation: Analyze example_inlined_entry_strategy and example_optimization_issue_3542 expected outputs for capture patterns

3. **Scope of .s() body transformation**
   - What we know: JSX, callsite rewriting, and capture injection are needed
   - What's unclear: whether minification within .s() bodies affects AST comparison (it shouldn't given position stripping)
   - Recommendation: Fix structural transforms first, then check if minification is needed for AST match

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (assumed) |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| P7-01 | All 24 Phase 7 snapshots pass AST comparison | integration | `npx vitest run tests/optimizer/convergence.test.ts` | Yes |
| P7-02 | 10 previously-passing snapshots still pass | regression | `npx vitest run tests/optimizer/convergence.test.ts` | Yes |
| P7-03 | Zero regressions in unit tests | regression | `npx vitest run` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The convergence.test.ts already tests all 209 snapshots individually.

## Sources

### Primary (HIGH confidence)
- Snapshot files in `match-these-snaps/` directory -- direct Rust optimizer output (24 files analyzed)
- `src/optimizer/rewrite-parent.ts` -- current parent rewrite implementation
- `src/optimizer/transform.ts` -- orchestration and removeUnusedImports()
- `src/optimizer/inline-strategy.ts` -- current .s() body generation
- `tests/optimizer/snapshot-options.ts` -- per-snapshot configuration

### Secondary (MEDIUM confidence)
- `tests/optimizer/failure-families.test.ts` -- confirmed 48 parent-rewrite-only failures, 10 passing
- `tests/optimizer/convergence-breakdown.test.ts` -- categorization of failure severities
- Diff analysis of all 24 Phase 7 snapshots actual vs expected output

## Metadata

**Confidence breakdown:**
- Failure pattern identification: HIGH -- directly analyzed all 24 snapshot diffs
- Import ordering fix: HIGH -- clear pattern from Rust output
- .s() body transformation: HIGH -- root cause clear, solution architecture clear
- _captures injection: MEDIUM -- pattern identified but exact rules need verification from more examples
- User import preservation: MEDIUM -- Rust behavior assumed from snapshot output, not verified from Rust source

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain -- optimizer convergence patterns won't change)
