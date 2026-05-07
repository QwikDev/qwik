# Convergence Failure Grouping

Snapshot of the 34 failing `pnpm vitest convergence` tests as of 2026-05-06, grouped by root cause for feature-sized work breakdown. Re-run `pnpm vitest convergence --run` to refresh; the categorization itself ages but is still a useful map.

The convergence test (`tests/optimizer/convergence.test.ts`) is stricter than `tests/optimizer/failure-families.test.ts` — it also checks segment metadata (`displayName`, `hash`, `canonicalFilename`, `ctxKind`, `ctxName`, `captures`). Snapshot of failure-families counts at the same point in time: 17 fully passing, 70 parent-rewrite-only, 0 untransformed, 3 segment-identity, 119 segment-codegen.

## Feature 1: Self-referential QRL `_ref` indirection (3 tests)

When a QRL captures a variable whose initializer references the QRL itself, the Rust optimizer emits a `_ref.<name>` indirection (assign-then-destructure) so the capture array does not TDZ. TS emits direct names.

- `component_level_self_referential_qrl`
- `example_self_referential_component_migration`
- `root_level_self_referential_qrl_inline`

## Feature 2: Hoisted / inline / lib entry strategies (5-6 tests)

Non-default entry strategies should keep segment bodies in the parent module via `inlinedQrl(body, name)` or `_noopQrl(name).s(body)` instead of extracting per-segment files. TS extracts unconditionally.

- `example_lib_mode`
- `example_qwik_react_inline`
- `example_parsed_inlined_qrls` (idempotency for already-inlined input)
- `example_reg_ctx_name_segments_hoisted`
- `example_optimization_issue_3542`
- `example_props_optimization` (also `_fnSignal` helper de-dup ordering)

## Feature 3: Inline-component `_rawProps` flattening (4 tests)

For lightweight (non-`component$`) JSX renderers, destructured params (`({ data })`) should be normalized to a single `_rawProps` parameter, with all member accesses rewritten (`data.x` → `_rawProps.data.x`). TS preserves the source destructure.

- `destructure_args_inline_cmp_block_stmt`
- `destructure_args_inline_cmp_block_stmt2`
- `destructure_args_inline_cmp_expr_stmt`
- `example_use_optimization`

## Feature 4: `_auto_*` re-export injection scoping (1 test)

TS emits `export { X as _auto_X }` for *every* module-level identifier captured by any segment, including inline destructures and locally-mutually-recursive components. Rust only does so when the identifier actually crosses a segment file boundary.

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

## Feature 8: Capture-aware segment body wiring + verbatim-source bug (5-6 tests)

Several issues conflated: segment body taken verbatim from source (preserving original indentation) instead of being emitted by the printer; capture binding emitted on its own line ahead of original code (whitespace/AST-level structural diff); structural rebuilds of renderer bodies are wrong.

- `example_getter_generation` (component renderer body wrong)
- `example_qwik_react` (whole module body kept; segments not extracted)
- `fun_with_scopes` (segment naming + nested capture scope off)
- `example_component_with_event_listeners_inside_loop` (loop-style naming `loopArrowFn`/`loopForI` vs `loopForIn`/`loopWhile`)
- `should_transform_three_nested_loops_handler_captures_outer_only` (verbatim body indentation)
- `should_wrap_prop_from_destructured_array` (verbatim body)

## Feature 9: Spread / var-props / const-props splitting (2 tests)

`_jsxSplit` argument structure (var props, const props, handler position) and ordering does not match Rust. Extra `_getVarProps`/`_getConstProps` wrappers added to already-spread values.

- `issue_7216_add_test`
- `should_mark_props_as_var_props_for_inner_cmp`

## Feature 10: Import-aware segment naming (2 tests)

- `example_capture_imports`: `useStyles$(css3)` where `css3` is a single import binding should produce a segment named after the import path (`style_css_TRu1FaIoUM0`), not the counter (`useStyles_1_xBK4W0ZKWe8`).
- `example_qwik_router_client`: large module exposing many edge-case naming differences (smallest test of segment-naming convention divergence at scale).

## Suggested implementation order

Smaller blast-radius first; F2/F8 last because they touch the whole emit pipeline.

| Order | Feature | Tests | Notes |
|---|---|---|---|
| 1 | F8 verbatim-body fix (subset) | 2-3 | Mechanical printer bug; trivial wins |
| 2 | F3 `_rawProps` flattening | 4 | Self-contained transform pass |
| 3 | F1 `_ref` indirection | 3 | Self-contained pass on capture analysis |
| 4 | F4 `_auto_*` scoping | 1 | Tighten re-export gating |
| 5 | F7 inner-function extraction discipline | 4 | Marker detection rules |
| 6 | F6 JSX runtime preservation | 3 | Front-end pass gating |
| 7 | F5 server-marker stripping | 3 | New transform pass |
| 8 | F9 spread/var/const splitting | 2 | Extends jsxify |
| 9 | F10 import-aware naming | 2 | Naming convention edge cases |
| 10 | F2 hoisted/inline/lib strategies | 5-6 | Largest scope; touches whole emit pipeline |
| 11 | F8 remainder (capture wiring) | 3 | Cannot fully resolve until F2/F3 land |

F1 + F3 + F4 + F5 alone clears ~11/34 (~32%) without touching F2 or F8.
