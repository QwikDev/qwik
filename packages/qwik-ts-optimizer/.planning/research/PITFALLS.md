# Domain Pitfalls

**Domain:** TypeScript compiler/optimizer rewriting (Qwik optimizer SWC-to-TS port)
**Researched:** 2026-04-10

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Scope Boundary Misclassification (Captures vs. Hoistable)

**What goes wrong:** The optimizer must decide for every identifier inside a `$()` closure whether it is (a) locally declared, (b) a capture from a parent scope, (c) a module-level import that should be re-imported in the segment, or (d) a global. Getting this wrong produces code that silently references `undefined` at runtime or captures too many variables (breaking lazy-loading efficiency). The nested loop case (`should_transform_handlers_capturing_cross_scope_in_nested_loops`) demonstrates the hardest variant: `rowIndex` is a capture (comes from an outer `.map()` callback) while `cellIndex` is a paramName (declared in the same loop scope as the handler). The distinction between `captures`, `captureNames`, `paramNames`, and `q:p`/`q:ps` injection is a four-way classification that must be exactly right.

**Why it happens:** JavaScript has five scope types (module, function, block via `let`/`const`, block via `var` hoisting, and catch clause). The `$()` boundary can appear inside any nesting of these. A naive "is it declared above?" check misses: (1) `var` declarations that hoist to the function scope, not the block, (2) destructured parameters like `({foo})` which create bindings at the parameter scope, not inside the function body, (3) re-declarations via `var` that shadow a capture, (4) `for...of`/`for...in` iterator variables which are block-scoped per-iteration.

**Consequences:** Wrong captures means the `.w([...])` call passes the wrong values at runtime. The hydration will either crash (captured value is undefined) or silently produce wrong behavior (captured value is stale/wrong). These bugs are the hardest to debug because the optimizer output "looks right" but fails at runtime.

**Prevention:**
- Use `oxc-walker`'s `ScopeTracker` which handles JS scoping rules natively rather than reimplementing scope analysis.
- Build a dedicated `classifyIdentifier(name, $boundary)` function that returns exactly one of: `local | capture | import | global`.
- Write targeted unit tests for each scope edge case BEFORE attempting snapshot matching. Cover: `var` hoisting across `$()`, destructured params, nested loops with `let`, `catch` clause variables, function declarations (which hoist differently from `const f = ...`).
- The snapshot `example_multi_capture` is an excellent canary: it has destructured `_rawProps` that must become a capture with `.w([_rawProps])`, plus a local `arg0` that gets inlined as `20`.

**Detection:** If captures are wrong, the metadata `"captures": true/false` and `"captureNames"` fields in snapshot comparison will fail first. Always compare metadata before code bodies.

**Phase mapping:** Must be solid in Phase 1 (core extraction). Cannot be deferred.

### Pitfall 2: Hash Instability from Non-Deterministic Input

**What goes wrong:** The SWC optimizer generates hashes like `HTDRsvUbLiE` and `DvU6FitWglY` that are deterministic for a given input. The hash is derived from the segment's display name (which encodes the path from file root through component/function nesting to the `$()` site). If your display name construction differs from SWC's by even one character -- e.g., `renderHeader1_div_onClick` vs `renderHeader1_onClick` -- the hash changes and the snapshot fails. This is separate from the hash algorithm itself; even with the correct algorithm, wrong input produces wrong hashes.

**Why it happens:** The display name is built by walking the AST path from root to `$()` call: file name, then each enclosing named scope (export name, component name, JSX element tag, event handler name). The rules for what gets included are subtle:
- `component$(() => ...)` uses the variable name (`Foo`), not `component`.
- `$(() => ...)` inside a component uses the counter suffix `_1`, `_2` for disambiguation.
- JSX event handlers include the element tag and event name: `div_onClick`.
- `host:onClick$` preserves the `host_onClick` prefix.
- Duplicate names at the same level get `_1` suffixes.
- Default exports use the filename as the component name.
- The `on-cLick$` hyphenated/mixed-case variants map to `q_e_c_lick` (hyphen becomes underscore in the name, case preserved in some contexts).

**Consequences:** Every segment hash depends on its display name. If display name construction is wrong, ALL hashes are wrong, and ALL snapshots fail. This is the single highest-leverage piece to get exactly right early.

**Prevention:**
- Reverse-engineer the display name algorithm from snapshot data, not from the Rust source. The snapshots contain both `displayName` and `name` (which is `displayName_hash`). Extract all display names from all 209 snapshots and build a table of `input pattern -> display name`.
- Implement display name construction as a standalone, independently testable function.
- Test it against ALL 209 snapshots' metadata before writing any code generation.

**Detection:** Hash mismatches are immediately visible in metadata comparison. If even one hash is wrong, stop and fix display name construction before proceeding.

**Phase mapping:** Must be the FIRST thing validated, before any code generation.

### Pitfall 3: The Whack-a-Mole Convergence Trap (Prior Failure Mode)

**What goes wrong:** Fixing snapshot N breaks snapshot M. This was the exact failure mode of the prior Rust/oxc rewrite. The optimizer has ~30+ distinct behaviors (capture analysis, JSX transform, event handler naming, variable migration, signal wrapping, hoisting, etc.). When these behaviors interact, changing the implementation of one to fix test A can break test B which depends on the old (wrong) behavior of that same code path.

**Why it happens:** The prior attempt treated all 180 snapshots as one big regression suite. When a fix touched shared logic (e.g., scope analysis), dozens of snapshots shifted. The AI assistant would then chase the new failures, often reverting the original fix or introducing compensating hacks that made the code unmaintainable. Context was lost because the problem space exceeded working memory.

**Consequences:** The project never converges. Weeks of work produce no net progress. Eventually the codebase becomes so tangled with special cases that a restart is required (which is what happened).

**Prevention:** The batch-of-10 strategy in PROJECT.md is the correct mitigation. Additional reinforcements:
- **Lock batches with CI.** Once 10 snapshots pass, add them to a CI gate that blocks any PR breaking them. Not "run all tests and hope" -- a hard gate on the locked set.
- **Order batches by feature isolation.** First batch: simple extraction (no captures, no JSX, no signals). Second batch: captures only. Third batch: JSX transforms. Never mix feature categories in a batch.
- **Implement features as independent, composable passes** rather than a monolithic transform. Each pass should be testable in isolation: (1) segment extraction, (2) capture analysis, (3) name/hash generation, (4) code generation, (5) JSX transform, (6) signal wrapping, (7) variable migration, (8) event handler transform. Passes should not have hidden dependencies.
- **When a fix breaks a locked snapshot, treat it as a design problem** (the passes are coupled), not a bug to patch.

**Detection:** Track a "locked snapshot count" metric. It should be monotonically increasing. Any decrease means the whack-a-mole trap has activated.

**Phase mapping:** This is a process pitfall, not a code pitfall. Applies to ALL phases. The batch ordering strategy should be defined before Phase 1 starts.

### Pitfall 4: Event Handler Name Mapping Complexity

**What goes wrong:** JSX event handlers have a baroque naming and transformation scheme. From the `example_jsx_listeners` snapshot, the mapping rules include at least 7 distinct patterns:
- `onClick$` -> `q-e:click` (standard DOM event)
- `onDocumentScroll$` -> `q-e:documentscroll` (document-scoped)
- `on-cLick$` -> `q-e:c-lick` (hyphenated custom event, case partially preserved)
- `onDocument-sCroll$` -> `q-e:document--scroll` (hyphenated + document prefix, double-hyphen)
- `host:onClick$` -> `host:onClick$` (host-prefixed, NOT transformed to `q-e:`)
- `onDocument:keyup$` -> `q-e:document:keyup` (colon-scoped document)
- `onWindow:keyup$` -> `q-e:window:keyup` (colon-scoped window)
- `custom$` -> `custom$` (non-`on` prefix, NOT transformed to `q-e:`)
- Duplicate names get `_1` suffix in display name but duplicate keys in the JSX output

**Why it happens:** This is an accumulation of organic complexity in Qwik's event system. Each pattern was added to handle a different use case (DOM events, document events, window events, custom events, host bindings). The mapping rules were never designed as a clean grammar.

**Consequences:** Getting even one mapping rule wrong causes the wrong event to be bound at runtime. The `_jsxSorted` call's property keys must exactly match what the Qwik runtime expects. A `q-e:click` vs `q-e:Click` difference means the event handler is never called.

**Prevention:**
- Extract ALL event handler patterns from ALL snapshots into a lookup table.
- Implement event name mapping as a pure function with exhaustive test coverage against this table.
- Pay special attention to the `host:` prefix (not transformed to `q-e:`) and `custom$` patterns (kept as-is if no `on` prefix).

**Detection:** Event handler snapshots will fail at the `_jsxSorted` call level. If you see `q-e:` key mismatches, the event name mapper is wrong.

**Phase mapping:** Phase 3 (JSX transforms). Should be done after basic extraction and captures work.

## Moderate Pitfalls

### Pitfall 5: Variable Migration Logic

**What goes wrong:** The optimizer decides whether module-scope declarations should stay in the parent module or migrate to a segment. The `example_segment_variable_migration` snapshot shows: `helperFn` (only used by one segment) migrates INTO that segment. `SHARED_CONFIG` (used by multiple segments) stays at root but gets a re-export as `_auto_SHARED_CONFIG` so segments can import it. Exported declarations always stay at root.

**Prevention:**
- Build a reference graph: for each module-scope declaration, which segments reference it?
- If referenced by exactly one segment and not exported: migrate.
- If referenced by multiple segments: keep at root, add `_auto_` re-export.
- If exported: always keep at root.
- The `_auto_` prefix convention must match exactly.

**Detection:** The parent module output will have wrong declarations (missing or extra). Segment outputs will have wrong imports.

**Phase mapping:** Later phase (Phase 4+). Can be deferred until basic extraction works.

### Pitfall 6: Signal Wrapping and `_fnSignal` Hoisting

**What goes wrong:** JSX props that contain reactive expressions must be wrapped with `_wrapProp` or `_fnSignal`. The classification logic determines: is this prop static (goes to constProps in `_jsxSorted`), dynamic-simple (`_wrapProp`), dynamic-computed (`_fnSignal` with hoisted function), or non-inlineable (goes to varProps)? The `example_derived_signals_cmp` snapshot shows all four categories and their exact classification. Additionally, `_fnSignal` helper functions are hoisted to module scope with names like `_hf0`, `_hf1` and accompanying `_hf0_str` string representations.

**Prevention:**
- Build the prop classification as a standalone function: `classifyProp(expr, scopeInfo) -> 'static' | 'signal' | 'computed' | 'dynamic'`.
- The `_fnSignal` string representation (`_hf0_str`) must exactly match the minified expression. E.g., `p0.value.selected.value?"danger":""` -- note no spaces around `?` and `:`.
- The numbering `_hf0`, `_hf1` depends on encounter order during AST traversal.

**Detection:** The `_jsxSorted` call structure in segment output will differ. The hoisted `_hf` declarations will be missing or wrong.

**Phase mapping:** Phase 3 (JSX transforms), specifically the signal sub-phase.

### Pitfall 7: magic-string Edit Ordering and Offset Corruption

**What goes wrong:** `magic-string` operates on the original source positions. When multiple edits target the same region (e.g., replacing a `$()` call that contains another `$()` call), the edit order matters. Inner replacements must happen before outer ones, or the outer replacement clobbers the inner. There is also a known issue where the `byStart`/`byEnd` maps are never updated to remove old chunks, causing later insertions at certain positions to be lost.

**Prevention:**
- Always process `$()` sites from innermost to outermost (deepest nesting first).
- Never edit overlapping ranges -- extract the inner `$()` first, then the outer.
- Use `magic-string`'s `overwrite()` rather than `remove()` + `appendLeft()` combinations which can interact badly.
- Test with deeply nested `$()` calls (3+ levels) early.

**Detection:** Output code will have garbled regions where edits overlapped. Usually manifests as missing code or duplicated code in the parent module.

**Phase mapping:** Phase 1 (core extraction). This is infrastructure, must work before anything else.

### Pitfall 8: AST Comparison False Positives and Negatives

**What goes wrong:** AST-based comparison for test assertions can be both too lenient and too strict. Too lenient: `x + y` and `y + x` parse to different ASTs but might be considered "equivalent" for commutative operators -- except JavaScript `+` is NOT always commutative (string concatenation). Too strict: `(x)` and `x` have different AST structure (ParenthesizedExpression vs raw) but are semantically identical. Arrow functions `() => x` vs `() => { return x; }` are semantically equivalent but structurally different.

**Prevention:**
- Normalize parenthesized expressions before comparison (strip unnecessary parens).
- Normalize `() => { return expr; }` to `() => expr` (or vice versa) before comparison.
- Do NOT normalize operator ordering -- `a + b` and `b + a` must be treated as different.
- Do NOT normalize string quote styles -- both single and double quotes should match since the runtime treats them the same, but the snapshot expects a specific style.
- Compare the `_jsxSorted` arguments structurally: `_jsxSorted("div", varProps, constProps, children, flags, key)` -- each positional argument must match.

**Detection:** Tests pass when they should fail (false positive) or fail on cosmetic differences (false negative). False positives are more dangerous because they hide real bugs.

**Phase mapping:** Phase 0 (test infrastructure). Must be built and validated before any implementation work.

### Pitfall 9: Import Reorganization in Generated Output

**What goes wrong:** The generated parent module and segment files must have correctly organized imports. The SWC optimizer: (1) splits multi-specifier imports into one-per-line (`import { qrl } from "@qwik.dev/core"` separate from `import { componentQrl } from "@qwik.dev/core"`), (2) rewrites `@builder.io/*` to `@qwik.dev/*`, (3) adds `import { _captures } from "@qwik.dev/core"` in segments with captures, (4) hoists QRL declarations as `const q_... = qrl(...)` between imports and the function body, (5) keeps a specific ordering: framework imports first, then user imports, then QRL declarations, then the segment export.

**Prevention:**
- Build import generation as a separate pass that collects all needed imports during code generation and emits them in a deterministic order.
- The snapshot comparison should ideally be lenient about import ordering, but strict about which imports are present. Verify your AST comparison handles this.

**Detection:** Import mismatches in segment output. Extra imports or missing imports.

**Phase mapping:** Phase 1-2 (code generation). Important but not the first thing to get right.

### Pitfall 10: Hoisted QRL Patterns and `.w()` Loop Context

**What goes wrong:** When a `$()` handler is used inside a loop, the QRL is hoisted OUTSIDE the loop and `.w([captures])` is called INSIDE the loop to bind loop-specific captures. In the nested loop snapshot, `q_...click...` is declared once at the top of the segment, then inside the `.map()` callback: `const click_handler = q_...click....w([rowIndex])`. If the QRL is NOT hoisted (declared inside the loop), every iteration creates a new QRL import -- functionally correct but semantically wrong and will fail snapshot matching.

**Prevention:**
- Detect whether a `$()` boundary is inside a loop (`.map`, `for`, `while`, `do`).
- If inside a loop, hoist the QRL declaration to the containing segment's top-level scope.
- Bind loop-variable captures via `.w([...])` at the usage site.
- The `q:p` (single param) vs `q:ps` (multiple params) distinction depends on paramNames count.

**Detection:** The segment output will have QRL declarations inside loop bodies instead of hoisted. The `_jsxSorted` call will pass inline QRLs instead of pre-bound references.

**Phase mapping:** Phase 3-4 (JSX + advanced transforms). Requires both captures and JSX to be working first.

## Minor Pitfalls

### Pitfall 11: File Extension Determination

**What goes wrong:** Segment output files have `.js`, `.jsx`, or `.tsx` extensions. The extension depends on whether the segment contains JSX syntax. The SWC optimizer uses: `.js` for pure JS segments, `.jsx` when JSX is present, `.tsx` when TypeScript + JSX. Getting this wrong doesn't break runtime but fails snapshot metadata comparison.

**Prevention:** After generating segment code, scan for JSX syntax to determine extension. Or track during extraction whether the segment body contained any JSX nodes.

**Phase mapping:** Phase 1 (metadata generation).

### Pitfall 12: `/*#__PURE__*/` Annotation Placement

**What goes wrong:** Tree-shaking annotations `/*#__PURE__*/` must be placed before specific calls: `componentQrl(...)`, `qrl(...)`, `_jsxSorted(...)`. Missing them doesn't break runtime but means bundlers cannot tree-shake unused components, and snapshots will fail on AST comparison (comments may or may not be preserved depending on parser config).

**Prevention:** Add `/*#__PURE__*/` before every `qrl()`, `componentQrl()`, and `_jsxSorted()` call in generated code. Ensure your AST comparison either preserves or explicitly ignores these annotations.

**Phase mapping:** Phase 2 (code generation refinement).

### Pitfall 13: Counter-based Naming for Duplicate Segments

**What goes wrong:** When multiple `$()` calls at the same nesting level would produce the same display name, SWC appends `_1`, `_2`, etc. The counter is per-parent-scope, not global. Two components both having a `$(() => ...)` call results in different parents, so no counter. But two `useStyles$()` calls inside the same component get `_useStyles` and `_useStyles_1`.

**Prevention:** Track a name counter per parent scope. Increment on collision. Test with the `example_capture_imports` snapshot which has two `useStyles$` calls producing different suffixes.

**Phase mapping:** Phase 1-2 (naming generation).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Test infrastructure (Phase 0) | AST comparison false positives hiding real bugs | Validate comparator against known-different inputs, not just known-same |
| Core extraction (Phase 1) | Display name / hash construction wrong, cascading to all tests | Build and validate naming against ALL 209 snapshot metadata first, before any codegen |
| Core extraction (Phase 1) | magic-string edit ordering for nested `$()` | Process innermost `$()` first; test with 3+ nesting levels |
| Capture analysis (Phase 1-2) | `var` hoisting, destructured params, loop variables misclassified | Dedicated scope edge-case unit tests before snapshot matching |
| JSX transforms (Phase 3) | Event handler name mapping has 7+ distinct patterns | Extract all patterns from snapshots into a lookup table, test exhaustively |
| Signal wrapping (Phase 3) | Prop classification (static/signal/computed/dynamic) is a 4-way split | Build classifier as pure function, test against `example_derived_signals_cmp` |
| Variable migration (Phase 4) | `_auto_` re-export convention must match exactly | Reference graph analysis: single-use = migrate, multi-use = re-export, exported = stay |
| Hoisted QRLs (Phase 4) | Loop detection for `.w()` hoisting | Must detect `.map()`, `for`, `while`, `do` as loop contexts |
| Batch locking (All phases) | Fixing batch N+1 breaks batch N (whack-a-mole) | CI gate on locked batches; features as composable passes, not monolith |

## Anti-Pattern: Treating Snapshots as String Templates

The prior Rust rewrite failed partly because it tried to match SWC's exact string output. The current approach (AST comparison) is correct, but there is a subtler version of this trap: treating the snapshot's CODE as the spec while ignoring the METADATA. The metadata (`name`, `hash`, `displayName`, `captures`, `captureNames`, `paramNames`, `ctxKind`, `ctxName`, `parent`, `extension`) is the actual contract. The code body has flexibility (formatting, parenthesization, quote style) but the metadata must match exactly. 

**Recommendation:** Compare metadata first, code second. If metadata matches but code differs, it is likely a cosmetic issue. If metadata differs, it is always a real bug.

## Sources

- [Qwik Optimizer Brainstorm](https://hackmd.io/@qwik/HJVXmRaBK) - original design document for optimizer behavior
- [Qwik Optimizer Rules](https://qwik.dev/docs/advanced/optimizer/) - official docs on optimizer constraints
- [magic-string state corruption issue #115](https://github.com/Rich-Harris/magic-string/issues/115) - known bug in edit tracking
- [Snapshot Testing for Compilers](https://www.cs.cornell.edu/~asampson/blog/turnt.html) - best practices for compiler snapshot testing
- [compare-ast](https://github.com/jugglinmike/compare-ast) - AST comparison tool demonstrating the pattern matching approach
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) - parser documentation
- [oxc-walker npm](https://socket.dev/npm/package/oxc-walker) - walker/scope tracker documentation
- Analysis of 209 snapshot files in `match-these-snaps/` directory (primary source for all behavior patterns)
