# Convergence Failure Grouping

Snapshot of the 30 failing `pnpm vitest convergence` tests as of 2026-05-12, grouped by root cause for feature-sized work breakdown. Re-run `pnpm vitest convergence --run` to refresh; the categorization itself ages but is still a useful map.

Investigation 2026-05-06 corrected the original groupings for F3, F4, F8 after tracing diffs to actual root causes in code. Original groupings were based on diff symptoms; corrected groupings reflect the underlying transformation gap. Convergence count is now **30/212** — F1 closed 2026-05-07 (`component_level_self_referential_qrl`); F4 closed 2026-05-09 ([OSS-359](https://linear.app/kunai/issue/OSS-359) / PR #42, `example_invalid_references`); F1b closed 2026-05-11 ([OSS-360](https://linear.app/kunai/issue/OSS-360) / PR #46, `example_self_referential_component_migration`); F8a closed 2026-05-12 ([OSS-361](https://linear.app/kunai/issue/OSS-361) / PR #48, `example_getter_generation`). Date stamp updated: 2026-05-12.

The convergence test (`tests/optimizer/convergence.test.ts`) is stricter than `tests/optimizer/failure-families.test.ts` — it also checks segment metadata (`displayName`, `hash`, `canonicalFilename`, `ctxKind`, `ctxName`, `captures`). Snapshot of failure-families counts at the same point in time: 17 fully passing, 70 parent-rewrite-only, 0 untransformed, 3 segment-identity, 119 segment-codegen.

## Feature 1: Self-referential QRL `_ref` indirection (CLOSED — 1 test passing)

When a component body declares `const X = useFooQrl(q_yyy.w([X]))`, the capture
array references `X` inside its own initializer (TDZ). The Rust optimizer
rewrites to `_ref` indirection so the QRL runtime resolves `_ref.X` lazily after
assignment:

    const _ref = {};
    _ref.X = useFooQrl(q_yyy.w([_ref.X]));
    const { X } = _ref;

**Resolved:** `applySelfRefIndirection` in `src/optimizer/segment-codegen/body-transforms.ts`
runs as a post-pass after `rewriteNestedCallSitesInline`. AST-walks the body's
`q_xxx.w([...])` arrays, detects Identifier elements matching the enclosing
const declarator name, and emits `_ref` indirection edits in reverse order to
avoid offset overlap. Companion fix: removed the `component$`/`componentQrl`
ctxName gate from `applyRawPropsIfComponent` so non-component qrl segments
(e.g. `useAsync$(({cleanup}) => ...)`) also get destructured first params
normalised to `_rawProps` to match SWC.

- ✅ `component_level_self_referential_qrl` (passing)

The other two tests originally grouped here have different root causes — see F1b
and F1c below.

## Feature 1b: Mutual-recursion component migration (1 test, OPEN)

When components are mutually recursive (`A` references `B`, `B` references `A`)
and not exported, Rust migrates one component's `componentQrl(...)` declaration
INTO the other component's segment file rather than keeping both in the parent
with `_auto_*` re-exports. Example: in the expected output for
`example_self_referential_component_migration`, `ComponentB`'s
`componentQrl(...)` is moved into `ComponentA`'s segment file, and `ComponentA`
stays in the parent with `_auto_ComponentA`. TS currently keeps both in the
parent and re-exports both as `_auto_*`.

This is a multi-pass migration policy refinement, related to F4 (MIG-05a) but
operating on mutually-recursive component declarations rather than shared
destructures.

- `example_self_referential_component_migration`

## Feature 1c: Inline-strategy emit ordering for self-referential components (1 test, OPEN)

For inline entry strategy with a self-referential root-level component (e.g.
`const Tree = component$((props) => <Tree/>)`), the Rust output emits:

    const q_Tree_xxx = _noopQrlDEV("Tree_xxx", {...});
    export const Tree = componentQrl(q_Tree_xxx);
    q_Tree_xxx.s((props) => {...uses Tree...});

The `.s(body)` call comes AFTER `Tree` is declared, so the body's reference to
`Tree` resolves correctly at runtime. TS currently emits `.s(body)` before
`Tree` is defined, causing a forward reference (TDZ at module load).

This is part of Feature 2 (hoisted/inline/lib entry strategies) — fix the inline
strategy emit order.

- `root_level_self_referential_qrl_inline`

## Feature 2: Hoisted / inline / lib entry strategies (5-6 tests)

Non-default entry strategies should keep segment bodies in the parent module via `inlinedQrl(body, name)` or `_noopQrl(name).s(body)` instead of extracting per-segment files. TS extracts unconditionally.

- `example_lib_mode`
- `example_qwik_react_inline`
- `example_parsed_inlined_qrls` (idempotency for already-inlined input)
- `example_reg_ctx_name_segments_hoisted`
- `example_optimization_issue_3542`
- `example_props_optimization` (also `_fnSignal` helper de-dup ordering)

## Feature 3: Inline-component `_rawProps` coordinated rewrite (4 tests)

Originally framed as "a single self-contained transform pass." It isn't. After tracing through the codebase, the lightweight-inline-component fix requires 8 coordinated changes that all need to land together for any of the 4 tests to flip from FAIL to PASS:

1. **Detection**: identify `export default ({...}) => <jsx/>` (no `component$()` wrapper) as a lightweight inline component.
2. **Param rewrite**: `({ data })` → `(_rawProps)`. The function `applyRawPropsTransform` already exists but is gated to `componentQrl`/`component$` ctxKind only, at `src/optimizer/rewrite/inline-body.ts:223`.
3. **Body rewrite in PARENT**: replace inline `onClick$={() => {...}}` arrow with extracted QRL reference. Currently the segment file is created but the parent body keeps the inline arrow.
4. **`_fnSignal` helper rewriting**: `_hf0 = (p0)=>p0.selectedOutputDetail` → `(p0)=>p0.data.selectedOutputDetail`.
5. **JSX prop injection**: add `"q:p": _rawProps` to the var-props bag.
6. **JSX flags recompute**: e.g., `3` → `6` due to the new `q:p`.
7. **Capture-array rewriting**: `_fnSignal(_hf0, [data], ...)` → `_fnSignal(_hf0, [_rawProps], ...)`.
8. **Segment param + body**: `(_, _1, data)` → `(_, _1, _rawProps)` and access through `_rawProps.data`.

- `destructure_args_inline_cmp_block_stmt`
- `destructure_args_inline_cmp_block_stmt2`
- `destructure_args_inline_cmp_expr_stmt`
- `example_use_optimization` (uses `component$` rather than lightweight inline; tests chained-destructure folding — kept here but flagged as the odd one out)

## Feature 4: MIG-05 shared-destructure reexport refinement (1 test)

The actual root cause for `example_invalid_references` is the MIG-05 rule in `src/optimizer/variable-migration.ts:442-444`:

```typescript
if (decl.isPartOfSharedDestructuring && usedByAnySegment) {
    return { action: 'reexport', ... };
}
```

This blanket-reexports every binding of a shared destructure when ANY segment uses ANY binding. The Rust optimizer instead `move`s the whole destructure into the target segment when **ALL** bindings flow to **exactly one** segment (no root use, no cross-segment use, not exported). MIG-05 is correct for cases like `should_keep_non_migrated_binding_from_shared_destructuring_declarator` (some bindings go to root, others to segment — must reexport), but wrong for our test where all bindings go to a single segment.

The fix is to refine `decideMigration` (or add a post-pass) so it groups decls by `declStart`/`declEnd` and, for each shared-destructure group, checks "do all bindings go to exactly one segment, with no root/multi-segment/export usage?" — if so, mark all of them `move` to that segment.

- `example_invalid_references` (wrongly emits 7 `_auto_I*` exports for a module destructure used only inside the parent)

## Feature 5: Server-only marker stripping → `null` body segments (3 tests)

With strip mode, server-only markers (`useClientMount$`, `serverStuff$`, `useServerMount$`, dev-mode noop) should produce stub segments (`export const X = null`) named `s_<hash>`. TS extracts full bodies regardless of strip flags.

- `example_strip_client_code`
- `example_strip_server_code`
- `example_noop_dev_mode`

## Feature 6: Foreign JSX runtime / pragma preservation (3 tests)

When source uses non-qwik JSX (`/* @jsxImportSource react */`, `react/jsx-runtime`), the TS optimizer rewrites it to qwik's `_jsxSorted`/`_jsxSplit` instead of leaving it alone. Also includes user-symbol-collision aliasing.

- `example_jsx_import_source` (pragma stripped, `_jsx` → `_jsxSorted`)
- `example_qwik_conflict` (user `qrl` import not aliased; injected `qrl` clobbers it)
- `should_split_spread_props_with_additional_prop5` (react `_jsx` rewritten unnecessarily)

## Feature 7: Inner-function extraction discipline (4 tests)

TS extracts any nested arrow/function as a candidate segment. Rust only extracts when a marker (`$`) directly applies to the boundary; lightweight functional components, plain locals (`render`, `remove`), and inline JSX renderers stay inline.

- `example_functional_component_capture_props`
- `example_lightweight_functional`
- `example_immutable_analysis` (extra `remove` segment shouldn't exist)
- `example_invalid_segment_expr1` (locals `style`, `render` extracted incorrectly)
- `fun_with_scopes` (6 extra segments from inner inline components — moved here from F8)

## Feature 8: Diverse semantic bugs sharing a "verbatim body" symptom (4 remaining tests; 1 closed)

**Lead-in note**: the original "verbatim body" / "mechanical printer issue" framing was misleading. After examining each test's AST diff, every test in this bucket has a real semantic bug, NOT a printer/whitespace issue. F8 should NOT be treated as a single coherent feature — each test needs its own fix. They share only the symptom that "segment body looks similar to source."

- ✅ `example_getter_generation` — ternary `'true'+1 ? 'true' : ''` not constant-folded; emitted `prop: "true"+1?"true":""` instead of `prop: 'true'`. **Closed via PR #48 ([OSS-361](https://linear.app/kunai/issue/OSS-361))** — new `src/optimizer/utils/simplify.ts` module ports the JSX-prop slice of SWC's `simplify::simplifier`. Production fix (not compareAst) because SWC explicitly invokes the simplifier at `swc-reference-only/parse.rs:360` — it's an intentional code-size optimization, not parity scaffolding.
- `should_transform_three_nested_loops_handler_captures_outer_only` — capture analysis fails to detect outer-loop var `planeId` as the actual capture; emits `q:ps:[cell, ci]` and drops the `const planeId='p'+pi` line entirely.
- `should_wrap_prop_from_destructured_array` — `_fnSignal` helper de-dup is too aggressive (only emits `_hf0`, missing `_hf1` for `store5.errors.test`); destructure of `useForm2()` result not flattened; missing `error4`/`error5` JSX props.
- `example_qwik_react` — module-level `filterProps` should become `_auto_filterProps as filterProps` in the segment; instead actual nonsense-imports `reactCmpQrl` from `@qwik.dev/core`.
- `example_component_with_event_listeners_inside_loop` — all 6 capture-bindings emitted inside `loopArrowFn` instead of at component scope (wrong hoist target depth).

## Feature 9: Spread / var-props / const-props splitting (2 tests)

`_jsxSplit` argument structure (var props, const props, handler position) and ordering does not match Rust. Extra `_getVarProps`/`_getConstProps` wrappers added to already-spread values.

- `issue_7216_add_test`
- `should_mark_props_as_var_props_for_inner_cmp`

## Feature 10: Import-aware segment naming (2 tests)

- `example_capture_imports`: `useStyles$(css3)` where `css3` is a single import binding should produce a segment named after the import path (`style_css_TRu1FaIoUM0`), not the counter (`useStyles_1_xBK4W0ZKWe8`).
- `example_qwik_router_client`: large module exposing many edge-case naming differences (smallest test of segment-naming convention divergence at scale).

## Suggested implementation order

Smaller blast-radius first; F2/F3 last because they touch the largest pipelines.

| Order | Feature | Tests | Notes |
|---|---|---|---|
| 1 | F4 MIG-05 refinement | 1 | Smallest verified scope; 1 boolean refinement in `decideMigration` plus group-by-declStart logic |
| 2 | F1 `_ref` indirection | ✅ closed (1/1 covered tests passing) | F1b and F1c remain open. |
| 2a | F1b mutual-recursion component migration | 1 | Related to F4 (mutual-recursion vs shared-destructure migration policy); multi-pass migration refinement |
| 3 | F8 individual fixes | 4 (1 of 5 closed) | F8a closed via PR #48 (ternary fold → `simplify.ts`). 4 remaining: hoist depth, `_fnSignal` dedup, capture-analysis, migration. Tackle case-by-case. |
| 4 | F7 inner-function extraction discipline | 4 + `fun_with_scopes` from F8 | Marker detection rules |
| 5 | F6 JSX runtime preservation | 3 | Front-end pass gating |
| 6 | F5 server-marker stripping | 3 | New transform pass |
| 7 | F9 spread/var/const splitting | 2 | Extends jsxify |
| 8 | F10 import-aware naming | 2 | Naming convention edge cases |
| 9 | F3 lightweight-inline coordinated rewrite | 4 | 8 coordinated changes — use a Plan agent before attempting |
| 10 | F2 hoisted/inline/lib strategies + F1c inline-emit ordering | 5-6 (F1c folds in here) | Largest scope; touches whole emit pipeline |

F1 (closed) + F4 + F5 alone clears ~7/34 (~21%) without touching F2/F3 — though F4 still has the parent-passes-but-segments-fail caveat.
