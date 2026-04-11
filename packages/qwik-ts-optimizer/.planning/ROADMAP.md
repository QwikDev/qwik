# Roadmap: v2.0 Snapshot Convergence

## Overview

Get all 209 snapshot tests passing via AST comparison. Ordered by failure family — parent-rewrite fixes first (closest wins), then untransformed extraction, then segment identity, then segment codegen. Hard lock after each phase: all previously-passing snapshots must stay green.

**Starting point:** 10/209 fully passing, 82/209 parent modules pass AST comparison, 471 unit tests green.

**Hard gate per phase:** Every snapshot in the phase must pass (parent + all segments match via AST comparison). All previously-locked snapshots must still pass. No exceptions.

## Phases

- [ ] **Phase 7: Parent Rewrite Batch 1** — First 24 parent-rewrite-only failures
- [ ] **Phase 8: Parent Rewrite Batch 2** — Remaining 24 parent-rewrite-only failures
- [ ] **Phase 9: Untransformed Extraction** — All 11 untransformed failures
- [x] **Phase 10: Segment Identity Batch 1** — First 21 segment-identity failures (completed 2026-04-11)
- [x] **Phase 11: Segment Identity Batch 2** — Next 21 segment-identity failures (completed 2026-04-11)
- [x] **Phase 12: Segment Identity Batch 3** — Remaining 21 segment-identity failures (completed 2026-04-11)
- [x] **Phase 13: Segment Codegen Batch 1** — First 25 segment-codegen failures (completed 2026-04-11)
- [ ] **Phase 14: Segment Codegen Batch 2** — Next 25 segment-codegen failures
- [ ] **Phase 15: Segment Codegen Batch 3** — Remaining 26 segment-codegen failures
- [ ] **Phase 16: Final Convergence** — Any remaining failures + 209/209 validation

## Phase Details

### Phase 7: Parent Rewrite Batch 1
**Goal**: First 24 parent-rewrite-only snapshots pass (segments already OK, fix parent module shape)
**Depends on**: Nothing (first phase of v2.0)
**Snapshots**: example_1, example_default_export_index, example_derived_signals_children, example_derived_signals_cmp, example_derived_signals_complext_children, example_derived_signals_div, example_derived_signals_multiple_children, example_dev_mode_inlined, example_functional_component, example_immutable_function_components, example_inlined_entry_strategy, example_input_bind, example_issue_33443, example_issue_4438, example_lib_mode, example_missing_custom_inlined_functions, example_mutable_children, example_optimization_issue_3542, example_optimization_issue_3561, example_optimization_issue_3795, example_optimization_issue_4386, example_parsed_inlined_qrls, example_preserve_filenames, example_props_optimization
**Success Criteria**:
  1. All 24 snapshots pass parent + segment AST comparison
  2. All 10 previously-passing snapshots still pass
  3. Zero regressions in 471 unit tests
**Plans**: 5 plans
Plans:
- [x] 07-01-PLAN.md — Import assembly unification and user import preservation
- [x] 07-02-PLAN.md — .s() body transformation pipeline for inline/hoist strategy
- [x] 07-03-PLAN.md — Segment-strategy fixes and inline-minor issues (gap closure)
- [x] 07-04-PLAN.md — JSX transpilation in inline .s() bodies (gap closure)
- [x] 07-05-PLAN.md — Hoist const-function pattern and final sweep (gap closure)

### Phase 8: Parent Rewrite Batch 2
**Goal**: Remaining 24 parent-rewrite-only snapshots pass
**Depends on**: Phase 7
**Snapshots**: example_props_wrapping, example_props_wrapping2, example_props_wrapping_children, example_props_wrapping_children2, example_qwik_react_inline, example_reg_ctx_name_segments_hoisted, example_reg_ctx_name_segments_inlined, example_strip_client_code, example_transpile_ts_only, example_use_optimization, fun_with_scopes, inlined_qrl_uses_identifier_reference_when_hoisted_snapshot, issue_476, root_level_self_referential_qrl_inline, should_ignore_null_inlined_qrl, should_keep_module_level_var_used_in_both_main_and_qrl, should_keep_non_migrated_binding_from_shared_array_destructuring_declarator, should_keep_non_migrated_binding_from_shared_destructuring_declarator, should_keep_non_migrated_binding_from_shared_destructuring_with_default, should_keep_non_migrated_binding_from_shared_destructuring_with_rest, should_keep_root_var_used_by_export_decl_and_qrl, should_keep_root_var_used_by_exported_function_and_qrl, should_not_generate_conflicting_props_identifiers, should_not_move_over_side_effects
**Success Criteria**:
  1. All 24 snapshots pass parent + segment AST comparison
  2. All phase 7 locked snapshots + 10 original still pass
  3. Zero regressions in unit tests
**Plans**: 5 plans
Plans:
- [x] 08-01-PLAN.md — TS stripping from parent output + capture suppression for _auto_ migrated vars
- [x] 08-02-PLAN.md — No-extraction passthrough, inlinedQrl(null) detection, hoist-to-const for inline strategy
- [x] 08-03-PLAN.md — Signal wrapping in JSX children + _rawProps destructuring optimization
- [x] 08-04-PLAN.md — regCtxName / _regSymbol support for server-tagged extractions
- [x] 08-05-PLAN.md — Remaining snapshot fixes and final regression sweep

### Phase 9: Untransformed Extraction
**Goal**: All 11 untransformed snapshots pass (extraction not currently happening)
**Depends on**: Phase 8
**Snapshots**: example_3, example_immutable_analysis, example_qwik_react, example_renamed_exports, example_server_auth, should_not_auto_export_var_shadowed_in_catch, should_not_auto_export_var_shadowed_in_do_while, should_not_auto_export_var_shadowed_in_labeled_block, should_not_auto_export_var_shadowed_in_switch, should_not_inline_exported_var_into_segment, should_preserve_non_ident_explicit_captures
**Success Criteria**:
  1. All 11 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Broaden marker detection for non-Qwik packages and renamed imports
- [x] 09-02-PLAN.md — Parse error recovery for malformed inputs (example_3, example_immutable_analysis)
- [x] 09-03-PLAN.md — inlinedQrl() extraction support with .w() capture syntax

### Phase 10: Segment Identity Batch 1
**Goal**: First 21 segment-identity snapshots pass (fix wrong names/hashes)
**Depends on**: Phase 9
**Snapshots**: example_8, example_build_server, example_capture_imports, example_capturing_fn_class, example_component_with_event_listeners_inside_loop, example_custom_inlined_functions, example_dev_mode, example_explicit_ext_no_transpile, example_explicit_ext_transpile, example_exports, example_functional_component_2, example_functional_component_capture_props, example_invalid_references, example_invalid_segment_expr1, example_jsx, example_jsx_import_source, example_jsx_listeners, example_multi_capture, example_noop_dev_mode, example_preserve_filenames_segments, example_prod_node
**Success Criteria**:
  1. All 21 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 10-01-PLAN.md — Duplicate display name disambiguation with _1/_2 counters
- [x] 10-02-PLAN.md — Prod mode s_ naming, import-source naming, captures metadata fix
- [x] 10-03-PLAN.md — JSX extraction scoping and final Phase 10 sweep

### Phase 11: Segment Identity Batch 2
**Goal**: Next 21 segment-identity snapshots pass
**Depends on**: Phase 10
**Snapshots**: example_qwik_conflict, example_qwik_router_client, example_reg_ctx_name_segments, example_strip_server_code, example_transpile_jsx_only, example_with_tagname, impure_template_fns, issue_150, issue_5008, lib_mode_fn_signal, should_convert_jsx_events, should_convert_passive_jsx_events, should_disable_multiple_rules_from_single_directive, should_disable_passive_warning_with_qwik_disable_next_line, should_extract_multiple_qrls_with_item_and_index, should_extract_multiple_qrls_with_item_and_index_and_capture_ref, should_extract_single_qrl, should_extract_single_qrl_2, should_extract_single_qrl_with_index, should_extract_single_qrl_with_nested_components, should_handle_dangerously_set_inner_html
**Success Criteria**:
  1. All 21 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 11-01-PLAN.md — JSXFragment context, passive event naming, custom call context push
- [x] 11-02-PLAN.md — Captures metadata reconciliation and snapshot options correction
- [x] 11-03-PLAN.md — Complex multi-segment fixes and Phase 11 convergence gate

### Phase 12: Segment Identity Batch 3
**Goal**: Remaining 21 segment-identity snapshots pass
**Depends on**: Phase 11
**Snapshots**: should_ignore_preventdefault_with_passive, should_not_transform_events_on_non_elements, should_not_wrap_fn, should_only_disable_the_next_line, should_transform_block_scoped_variables_and_item_index_in_loop, should_transform_block_scoped_variables_in_loop, should_transform_component_with_normal_function, should_transform_event_names_without_jsx_transpile, should_transform_handlers_capturing_cross_scope_in_nested_loops, should_transform_loop_multiple_handler_with_different_captures, should_transform_multiple_block_scoped_variables_and_item_index_in_loop, should_transform_multiple_block_scoped_variables_in_loop, should_transform_multiple_event_handlers, should_transform_multiple_event_handlers_case2, should_transform_nested_loops, should_transform_nested_loops_handler_captures_only_inner_scope, should_transform_passive_event_names_without_jsx_transpile, should_transform_same_element_one_handler_with_captures_one_without, should_transform_three_nested_loops_handler_captures_outer_only, should_transform_two_handlers_capturing_different_block_scope_in_loop, should_wrap_prop_from_destructured_array
**Success Criteria**:
  1. All 21 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 12-01-PLAN.md — Loop-aware capture classification and segment signature rewriting
- [x] 12-02-PLAN.md — .w() hoisting, q:p placement, signal dedup, and non-loop fixes
- [x] 12-03-PLAN.md — Phase 12 convergence sweep and regression gate

### Phase 13: Segment Codegen Batch 1
**Goal**: First 25 segment-codegen snapshots pass (segment found by name but code wrong)
**Depends on**: Phase 12
**Snapshots**: component_level_self_referential_qrl, destructure_args_colon_props, destructure_args_colon_props2, destructure_args_colon_props3, destructure_args_inline_cmp_block_stmt, destructure_args_inline_cmp_block_stmt2, destructure_args_inline_cmp_expr_stmt, example_10, example_11, example_7, example_9, example_class_name, example_dead_code, example_default_export, example_drop_side_effects, example_export_issue, example_getter_generation, example_import_assertion, example_jsx_keyed, example_jsx_keyed_dev, example_lightweight_functional, example_manual_chunks, example_of_synchronous_qrl, example_segment_variable_migration, example_self_referential_component_migration
**Success Criteria**:
  1. All 25 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 13-01-PLAN.md — Segment body transforms: _rawProps, TS stripping, sync$, dead code, separator
- [x] 13-02-PLAN.md — Post-transform segment import re-collection
- [x] 13-03-PLAN.md — Missing segments, convergence sweep, and regression gate

### Phase 14: Segment Codegen Batch 2
**Goal**: Next 25 segment-codegen snapshots pass
**Depends on**: Phase 13
**Snapshots**: example_spread_jsx, example_strip_exports_used, example_ts_enums, example_ts_enums_issue_1341, example_ts_enums_no_transpile, example_use_client_effect, example_use_server_mount, example_with_style, hmr, hoisted_fn_signal_in_loop, issue_7216_add_test, issue_964, moves_captures_when_possible, rename_builder_io, root_level_self_referential_qrl, should_convert_rest_props, should_destructure_args, should_disable_qwik_transform_error_by_code, should_ignore_passive_jsx_events_without_handlers, should_make_component_jsx_split_with_bind, should_mark_props_as_var_props_for_inner_cmp, should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after, should_merge_bind_checked_and_on_input, should_merge_bind_value_and_on_input
**Success Criteria**:
  1. All 25 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: 3 plans
Plans:
- [x] 14-01-PLAN.md — Nested marker call rewriting with calleeQrl wrapping in segment bodies
- [x] 14-02-PLAN.md — TS enum transpilation, _rawProps/_restProps extension, diagnostic stripping
- [ ] 14-03-PLAN.md — Bind merging, _fnSignal suppression, convergence sweep and regression gate

### Phase 15: Segment Codegen Batch 3
**Goal**: Remaining 26 segment-codegen snapshots pass
**Depends on**: Phase 14
**Snapshots**: should_merge_on_input_and_bind_checked, should_merge_on_input_and_bind_value, should_migrate_destructured_binding_with_imported_dependency, should_move_bind_value_to_var_props, should_move_props_related_to_iteration_variables_to_var_props, should_not_transform_bind_checked_in_var_props_for_jsx_split, should_not_transform_bind_value_in_var_props_for_jsx_split, should_not_wrap_ternary_function_operator_with_fn, should_not_wrap_var_template_string, should_split_spread_props, should_split_spread_props_with_additional_prop, should_split_spread_props_with_additional_prop2, should_split_spread_props_with_additional_prop3, should_split_spread_props_with_additional_prop4, should_split_spread_props_with_additional_prop5, should_transform_handler_in_for_of_loop, should_transform_qrls_in_ternary_expression, should_work, should_wrap_inner_inline_component_prop, should_wrap_logical_expression_in_template, should_wrap_object_with_fn_signal, should_wrap_store_expression, should_wrap_type_asserted_variables_in_template, support_windows_paths, ternary_prop, transform_qrl_in_regular_prop
**Success Criteria**:
  1. All 26 snapshots pass parent + segment AST comparison
  2. All previously-locked snapshots still pass
  3. Zero regressions in unit tests
**Plans**: TBD

### Phase 16: Final Convergence
**Goal**: 209/209 snapshots pass, full validation
**Depends on**: Phase 15
**Success Criteria**:
  1. convergence.test.ts reports 209/209 (or 208/208 excluding no-input relative_paths)
  2. Zero regressions in all unit tests
  3. `npx tsc --noEmit` clean
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 7. Parent Rewrite Batch 1 | 5/5 | Gap closure complete | - |
| 8. Parent Rewrite Batch 2 | 0/5 | Planning complete | - |
| 9. Untransformed Extraction | 0/3 | Planning complete | - |
| 10. Segment Identity Batch 1 | 3/3 | Complete    | 2026-04-11 |
| 11. Segment Identity Batch 2 | 3/3 | Complete    | 2026-04-11 |
| 12. Segment Identity Batch 3 | 3/3 | Complete    | 2026-04-11 |
| 13. Segment Codegen Batch 1 | 3/3 | Complete    | 2026-04-11 |
| 14. Segment Codegen Batch 2 | 2/3 | In Progress|  |
| 15. Segment Codegen Batch 3 | 0/TBD | Not started | - |
| 16. Final Convergence | 0/TBD | Not started | - |
