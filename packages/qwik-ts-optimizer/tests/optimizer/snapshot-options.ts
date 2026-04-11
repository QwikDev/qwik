/**
 * Per-snapshot options map for the Qwik optimizer convergence test.
 *
 * Maps snapshot test names (without qwik_core__test__ prefix and .snap suffix)
 * to their exact TransformModulesOptions overrides. Options not specified
 * use the Rust test defaults:
 *   - transpileTs: false
 *   - transpileJsx: false
 *   - mode: 'lib' (Rust's EmitMode::Test maps to our 'lib')
 *   - entryStrategy: { type: 'segment' }
 *   - minify: 'simplify'
 *   - filename: 'test.tsx'
 *   - srcDir: '/user/qwik/src/'
 *   - explicitExtensions: false
 *   - preserveFilenames: false
 *   - isServer: undefined
 *
 * Sources:
 *   - Rust test.rs from QwikDev/qwik (main branch, 3677 lines)
 *   - Snapshot output file analysis (extension, inline indicators, JSX markers)
 *   - Additional tests inferred from snapshot content for tests not in downloaded test.rs
 *
 * CRITICAL: The Rust default mode is EmitMode::Test which has no direct equivalent
 * in our TS API. It behaves like 'lib' mode (no prod optimizations, no dev instrumentation).
 */

import type { TransformModulesOptions } from '../../src/optimizer/types.js';

/**
 * Options override for a single snapshot test.
 * Only non-default fields need to be specified.
 */
export type SnapshotOptions = Partial<
  Pick<
    TransformModulesOptions,
    | 'transpileTs'
    | 'transpileJsx'
    | 'mode'
    | 'entryStrategy'
    | 'minify'
    | 'explicitExtensions'
    | 'preserveFilenames'
    | 'isServer'
    | 'stripExports'
    | 'stripCtxName'
    | 'regCtxName'
    | 'stripEventHandlers'
    | 'scope'
  >
> & {
  /** Override filename (default: 'test.tsx') */
  filename?: string;
  /** Override srcDir (default: '/user/qwik/src/') */
  srcDir?: string;
  /** Override devPath */
  devPath?: string;
};

/**
 * Default options matching Rust's TestInput::default().
 * Every snapshot uses these unless overridden in SNAPSHOT_OPTIONS.
 */
export const DEFAULT_OPTIONS: Required<
  Pick<SnapshotOptions, 'transpileTs' | 'transpileJsx' | 'mode' | 'minify' | 'filename' | 'srcDir'>
> & { entryStrategy: { type: 'segment' } } = {
  transpileTs: false,
  transpileJsx: false,
  mode: 'lib',
  entryStrategy: { type: 'segment' },
  minify: 'simplify',
  filename: 'test.tsx',
  srcDir: '/user/qwik/src/',
};

// ---------------------------------------------------------------------------
// Per-snapshot options (only non-default values)
// ---------------------------------------------------------------------------

/**
 * Map from snapshot name to options overrides.
 * Key is the test name (e.g., 'example_1', not the full filename).
 */
export const SNAPSHOT_OPTIONS: Record<string, SnapshotOptions> = {
  // =======================================================================
  // Tests from Rust test.rs with DEFAULT options (no overrides needed)
  // =======================================================================
  // These use: transpileTs=false, transpileJsx=false, mode='lib', entry=segment,
  //            minify=simplify, filename='test.tsx', srcDir='/user/qwik/src/'

  // example_1 through example_9: all defaults
  example_1: {},
  example_2: {},
  example_3: {},
  example_4: {},
  example_5: {},
  example_6: {},
  example_7: {},
  example_8: {},
  example_9: {},
  example_with_tagname: {},
  example_with_style: {},
  example_dead_code: {},
  example_lightweight_functional: {},
  example_strip_exports_unused: { stripExports: ['onGet'] },
  example_strip_exports_used: { stripExports: ['onGet'] },
  issue_476: {},
  example_ts_enums_no_transpile: {},
  special_jsx: {},

  // =======================================================================
  // Tests with filename override
  // =======================================================================
  example_10: { filename: 'project/test.tsx' },
  example_11: { filename: 'project/test.tsx', entryStrategy: { type: 'single' } },
  example_exports: { filename: 'project/test.tsx', transpileTs: true },
  issue_117: { filename: 'project/test.tsx', entryStrategy: { type: 'single' } },
  example_fix_dynamic_import: { filename: 'project/folder/test.tsx', entryStrategy: { type: 'single' } },
  example_default_export: {
    filename: 'src/routes/_repl/[id]/[[...slug]].tsx',
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'smart' },
    explicitExtensions: true,
  },
  example_default_export_index: {
    filename: 'src/components/mongo/index.tsx',
    entryStrategy: { type: 'inline' },
  },
  example_default_export_invalid_ident: { filename: 'src/components/mongo/404.tsx' },
  example_jsx_keyed_dev: {
    filename: 'project/index.tsx',
    srcDir: '/src/project',
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    explicitExtensions: true,
  },
  example_strip_client_code: {
    filename: 'components/component.tsx',
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'inline' },
    stripCtxName: ['useClientMount$'],
    stripEventHandlers: true,
  },
  support_windows_paths: {
    filename: 'components\\apps\\apps.tsx',
    srcDir: 'C:\\users\\apps',
    transpileJsx: true,
    isServer: false,
    entryStrategy: { type: 'segment' },
  },
  example_qwik_react: {
    filename: '../node_modules/@builder.io/qwik-react/index.qwik.mjs',
    entryStrategy: { type: 'segment' },
    explicitExtensions: true,
  },
  example_qwik_react_inline: {
    filename: '../node_modules/@builder.io/qwik-react/index.qwik.mjs',
    entryStrategy: { type: 'inline' },
    explicitExtensions: true,
  },
  // NOTE: example_qwik_sdk_inline has no snapshot file -- excluded from map

  // =======================================================================
  // Tests with transpileTs + transpileJsx (most common override combo)
  // =======================================================================
  example_functional_component_2: { transpileTs: true, transpileJsx: true },
  example_functional_component_capture_props: { transpileTs: true, transpileJsx: true },
  example_invalid_references: { transpileTs: true, transpileJsx: true },
  example_invalid_segment_expr1: { transpileTs: true, transpileJsx: true },
  example_capture_imports: { transpileTs: true, transpileJsx: true },
  example_capturing_fn_class: { transpileTs: true, transpileJsx: true },
  example_renamed_exports: { transpileTs: true, transpileJsx: true },
  example_jsx: { transpileTs: true, transpileJsx: true },
  example_jsx_listeners: { transpileTs: true, transpileJsx: true },
  example_qwik_conflict: { transpileTs: true, transpileJsx: true },
  example_custom_inlined_functions: { transpileTs: true, transpileJsx: true },
  example_missing_custom_inlined_functions: { transpileTs: true, transpileJsx: true },
  example_skip_transform: { transpileTs: true, transpileJsx: true },
  example_use_client_effect: { transpileTs: true, transpileJsx: true },
  example_import_assertion: { transpileTs: true, transpileJsx: true },
  issue_150: { transpileTs: true, transpileJsx: true },
  issue_964: { transpileTs: true, transpileJsx: true },
  example_immutable_analysis: { transpileTs: true, transpileJsx: true },
  example_ts_enums_issue_1341: { transpileTs: true, transpileJsx: true },
  example_ts_enums: { transpileTs: true, transpileJsx: true },
  example_spread_jsx: { transpileTs: true, transpileJsx: true },
  example_export_issue: { transpileTs: true, transpileJsx: true },
  example_getter_generation: { transpileTs: true, transpileJsx: true },
  issue_5008: { transpileTs: true, transpileJsx: true },
  example_of_synchronous_qrl: { transpileTs: true, transpileJsx: true },
  example_strip_server_code: {
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'segment' },
    stripCtxName: ['server'],
    mode: 'prod',  // Expected output uses s_ prefix naming
  },
  example_server_auth: {
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'segment' },
  },

  // =======================================================================
  // Tests with transpileTs only (no JSX transpile)
  // =======================================================================
  example_multi_capture: { transpileTs: true },

  // =======================================================================
  // Tests with transpileJsx only (no TS transpile)
  // =======================================================================
  lib_mode_fn_signal: { transpileJsx: true },
  impure_template_fns: { transpileJsx: true },

  // =======================================================================
  // Tests with minify override
  // =======================================================================
  example_functional_component: { minify: 'none' },

  // =======================================================================
  // Tests with entryStrategy overrides
  // =======================================================================
  example_inlined_entry_strategy: { entryStrategy: { type: 'inline' } },
  example_parsed_inlined_qrls: {
    entryStrategy: { type: 'inline' },
    mode: 'prod',
  },

  // =======================================================================
  // Tests with explicitExtensions
  // =======================================================================
  example_explicit_ext_transpile: {
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_explicit_ext_no_transpile: {
    explicitExtensions: true,
    entryStrategy: { type: 'single' },
  },
  example_jsx_import_source: {
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_jsx_keyed: {
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_transpile_jsx_only: {
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_class_name: {
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_mutable_children: {
    entryStrategy: { type: 'hoist' },
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_immutable_function_components: {
    entryStrategy: { type: 'hoist' },
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
  },
  example_transpile_ts_only: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    explicitExtensions: true,
  },
  example_preserve_filenames: {
    entryStrategy: { type: 'inline' },
    transpileJsx: true,
    preserveFilenames: true,
    explicitExtensions: true,
  },
  example_preserve_filenames_segments: {
    entryStrategy: { type: 'segment' },
    transpileTs: true,
    transpileJsx: true,
    preserveFilenames: true,
    explicitExtensions: true,
  },

  // =======================================================================
  // Tests with mode overrides
  // =======================================================================
  example_prod_node: { mode: 'prod' },
  example_build_server: { isServer: true, mode: 'prod' },
  example_dev_mode: {
    mode: 'dev',
    transpileTs: true,
    transpileJsx: true,
  },
  example_dev_mode_inlined: {
    mode: 'dev',
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
  },
  example_noop_dev_mode: {
    mode: 'dev',
    devPath: '/hello/from/dev/test.tsx',
    transpileTs: true,
    transpileJsx: true,
    stripEventHandlers: true,
    stripCtxName: ['server'],
  },

  // =======================================================================
  // Tests with isServer + entryStrategy combos
  // =======================================================================
  example_use_optimization: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    isServer: false,
  },
  example_optimization_issue_3561: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    isServer: false,
  },
  example_optimization_issue_4386: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    isServer: false,
  },
  example_optimization_issue_3542: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    isServer: false,
  },
  example_optimization_issue_3795: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
    isServer: false,
  },

  // =======================================================================
  // Tests with smart entry strategy
  // =======================================================================
  example_use_server_mount: {
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'smart' },
  },
  example_manual_chunks: {
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'smart' },
  },

  // =======================================================================
  // Tests with hoist entry strategy
  // =======================================================================
  example_derived_signals_div: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_issue_4438: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_derived_signals_children: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_derived_signals_multiple_children: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_derived_signals_complext_children: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_derived_signals_cmp: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },
  example_issue_33443: {
    transpileJsx: true,
    transpileTs: true,
    entryStrategy: { type: 'hoist' },
  },

  // =======================================================================
  // Tests with reg_ctx_name / strip_ctx_name / strip_event_handlers
  // =======================================================================
  example_drop_side_effects: {
    transpileTs: true,
    transpileJsx: true,
    isServer: false,
    mode: 'dev',
    entryStrategy: { type: 'segment' },
    stripCtxName: ['server'],
  },
  example_reg_ctx_name_segments: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
    regCtxName: ['server'],
    stripEventHandlers: true,
  },
  example_reg_ctx_name_segments_inlined: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
    regCtxName: ['server'],
  },
  example_reg_ctx_name_segments_hoisted: {
    entryStrategy: { type: 'hoist' },
    transpileTs: true,
    transpileJsx: true,
    regCtxName: ['server'],
  },

  // =======================================================================
  // Tests with inline entry strategy (various combos)
  // =======================================================================
  example_props_optimization: {
    transpileJsx: true,
    entryStrategy: { type: 'inline' },
    transpileTs: true,
  },
  example_input_bind: {
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
    mode: 'prod',
  },

  // =======================================================================
  // Tests NOT in downloaded test.rs — inferred from snapshot output
  // These tests appear in a newer version of test.rs (assertion_line > 3677)
  // Options inferred from: output file extension, inline/hoist markers, JSX transforms
  // =======================================================================

  // --- Segment strategy, transpileTs + transpileJsx (output is .js with JSX markers) ---
  destructure_args_colon_props: { transpileTs: true, transpileJsx: true },
  destructure_args_colon_props2: { transpileTs: true, transpileJsx: true },
  destructure_args_colon_props3: { transpileTs: true, transpileJsx: true },
  destructure_args_inline_cmp_block_stmt: { transpileTs: true, transpileJsx: true },
  destructure_args_inline_cmp_block_stmt2: { transpileTs: true, transpileJsx: true },
  destructure_args_inline_cmp_expr_stmt: { transpileTs: true, transpileJsx: true },
  example_component_with_event_listeners_inside_loop: { transpileTs: true, transpileJsx: true },
  hmr: { transpileTs: true, transpileJsx: true },
  hoisted_fn_signal_in_loop: { transpileTs: true, transpileJsx: true },
  issue_7216_add_test: { transpileTs: true, transpileJsx: true },
  moves_captures_when_possible: { transpileTs: true, transpileJsx: true },
  should_convert_jsx_events: { transpileTs: true, transpileJsx: true },
  should_convert_passive_jsx_events: { transpileTs: true, transpileJsx: true },
  should_convert_rest_props: { transpileTs: true, transpileJsx: true },
  should_destructure_args: { transpileTs: true, transpileJsx: true },
  should_disable_multiple_rules_from_single_directive: { transpileTs: true, transpileJsx: true },
  should_disable_passive_warning_with_qwik_disable_next_line: { transpileTs: true, transpileJsx: true },
  should_disable_qwik_transform_error_by_code: { transpileTs: true, transpileJsx: true },
  should_extract_multiple_qrls_with_item_and_index: { transpileTs: true, transpileJsx: true },
  should_extract_multiple_qrls_with_item_and_index_and_capture_ref: { transpileTs: true, transpileJsx: true },
  should_extract_single_qrl: { transpileTs: true, transpileJsx: true },
  should_extract_single_qrl_2: { transpileTs: true, transpileJsx: true },
  should_extract_single_qrl_with_index: { transpileTs: true, transpileJsx: true },
  should_extract_single_qrl_with_nested_components: { transpileTs: true, transpileJsx: true },
  should_handle_dangerously_set_inner_html: { transpileTs: true, transpileJsx: true },
  should_ignore_passive_jsx_events_without_handlers: { transpileTs: true, transpileJsx: true },
  should_ignore_preventdefault_with_passive: { transpileTs: true, transpileJsx: true },
  should_keep_module_level_var_used_in_both_main_and_qrl: { transpileTs: true, transpileJsx: true },
  should_keep_non_migrated_binding_from_shared_array_destructuring_declarator: { transpileTs: true, transpileJsx: true },
  should_keep_non_migrated_binding_from_shared_destructuring_declarator: { transpileTs: true, transpileJsx: true },
  should_keep_non_migrated_binding_from_shared_destructuring_with_default: { transpileTs: true, transpileJsx: true },
  should_keep_non_migrated_binding_from_shared_destructuring_with_rest: { transpileTs: true, transpileJsx: true },
  should_keep_root_var_used_by_export_decl_and_qrl: { transpileTs: true, transpileJsx: true },
  should_keep_root_var_used_by_exported_function_and_qrl: { transpileTs: true, transpileJsx: true },
  should_make_component_jsx_split_with_bind: { transpileTs: true, transpileJsx: true },
  should_mark_props_as_var_props_for_inner_cmp: { transpileTs: true, transpileJsx: true },
  should_merge_attributes_with_spread_props: { transpileTs: true, transpileJsx: true },
  should_merge_attributes_with_spread_props_before_and_after: { transpileTs: true, transpileJsx: true },
  should_merge_bind_checked_and_on_input: { transpileTs: true, transpileJsx: true },
  should_merge_bind_value_and_on_input: { transpileTs: true, transpileJsx: true },
  should_merge_on_input_and_bind_checked: { transpileTs: true, transpileJsx: true },
  should_merge_on_input_and_bind_value: { transpileTs: true, transpileJsx: true },
  should_migrate_destructured_binding_with_imported_dependency: { transpileTs: true, transpileJsx: true },
  should_move_bind_value_to_var_props: { transpileTs: true, transpileJsx: true },
  should_move_props_related_to_iteration_variables_to_var_props: { transpileTs: true, transpileJsx: true },
  should_not_auto_export_var_shadowed_in_catch: { transpileTs: true, transpileJsx: true },
  should_not_auto_export_var_shadowed_in_do_while: { transpileTs: true, transpileJsx: true },
  should_not_auto_export_var_shadowed_in_labeled_block: { transpileTs: true, transpileJsx: true },
  should_not_auto_export_var_shadowed_in_switch: { transpileTs: true, transpileJsx: true },
  should_not_inline_exported_var_into_segment: { transpileTs: true, transpileJsx: true },
  should_not_transform_bind_checked_in_var_props_for_jsx_split: { transpileTs: true, transpileJsx: true },
  should_not_transform_bind_value_in_var_props_for_jsx_split: { transpileTs: true, transpileJsx: true },
  should_not_wrap_fn: { transpileTs: true, transpileJsx: true },
  should_not_wrap_ternary_function_operator_with_fn: { transpileTs: true, transpileJsx: true },
  should_not_wrap_var_template_string: { transpileTs: true, transpileJsx: true },
  should_only_disable_the_next_line: { transpileTs: true, transpileJsx: true },
  should_split_spread_props: { transpileTs: true, transpileJsx: true },
  should_split_spread_props_with_additional_prop: { transpileTs: true, transpileJsx: true },
  should_split_spread_props_with_additional_prop2: { transpileTs: true, transpileJsx: true },
  should_split_spread_props_with_additional_prop3: { transpileTs: true, transpileJsx: true },
  should_split_spread_props_with_additional_prop4: { transpileTs: true, transpileJsx: true },
  should_split_spread_props_with_additional_prop5: { transpileTs: true, transpileJsx: true },
  should_transform_block_scoped_variables_and_item_index_in_loop: { transpileTs: true, transpileJsx: true },
  should_transform_block_scoped_variables_in_loop: { transpileTs: true, transpileJsx: true },
  should_transform_component_with_normal_function: { transpileTs: true, transpileJsx: true },
  should_transform_handler_in_for_of_loop: { transpileTs: true, transpileJsx: true },
  should_transform_handlers_capturing_cross_scope_in_nested_loops: { transpileTs: true, transpileJsx: true },
  should_transform_loop_multiple_handler_with_different_captures: { transpileTs: true, transpileJsx: true },
  should_transform_multiple_block_scoped_variables_and_item_index_in_loop: { transpileTs: true, transpileJsx: true },
  should_transform_multiple_block_scoped_variables_in_loop: { transpileTs: true, transpileJsx: true },
  should_transform_multiple_event_handlers: { transpileTs: true, transpileJsx: true },
  should_transform_multiple_event_handlers_case2: { transpileTs: true, transpileJsx: true },
  should_transform_nested_loops: { transpileTs: true, transpileJsx: true },
  should_transform_nested_loops_handler_captures_only_inner_scope: { transpileTs: true, transpileJsx: true },
  should_transform_qrls_in_ternary_expression: { transpileTs: true, transpileJsx: true },
  should_transform_same_element_one_handler_with_captures_one_without: { transpileTs: true, transpileJsx: true },
  should_transform_three_nested_loops_handler_captures_outer_only: { transpileTs: true, transpileJsx: true },
  should_transform_two_handlers_capturing_different_block_scope_in_loop: { transpileTs: true, transpileJsx: true },
  should_work: { transpileTs: true, transpileJsx: true },
  should_wrap_inner_inline_component_prop: { transpileTs: true, transpileJsx: true },
  should_wrap_logical_expression_in_template: { transpileTs: true, transpileJsx: true },
  should_wrap_object_with_fn_signal: { transpileTs: true, transpileJsx: true },
  should_wrap_prop_from_destructured_array: { transpileTs: true, transpileJsx: true },
  should_wrap_store_expression: { transpileTs: true, transpileJsx: true },
  should_wrap_type_asserted_variables_in_template: { transpileTs: true, transpileJsx: true },

  // --- No transpile (output is .tsx, no JSX markers) ---
  component_level_self_referential_qrl: {},
  example_segment_variable_migration: {},
  rename_builder_io: {},
  root_level_self_referential_qrl: {},
  should_not_transform_events_on_non_elements: {},
  should_transform_event_names_without_jsx_transpile: {},
  should_transform_passive_event_names_without_jsx_transpile: {},
  should_preserve_non_ident_explicit_captures: {},
  ternary_prop: {},
  transform_qrl_in_regular_prop: {},

  // --- Inline entry strategy, transpileTs + transpileJsx (inlinedQrl in output, no ENTRY POINT segments) ---
  fun_with_scopes: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },
  example_lib_mode: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },
  should_ignore_null_inlined_qrl: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },
  should_not_generate_conflicting_props_identifiers: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },
  should_not_move_over_side_effects: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },

  // --- Inline entry strategy with transpileTs + transpileJsx + hoist-like patterns ---
  root_level_self_referential_qrl_inline: {
    filename: 'node_modules/qwik-tree/index.qwik.jsx',
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'inline' },
    mode: 'dev',
  },

  // --- Hoist entry strategy ---
  example_props_wrapping: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'hoist' } },
  example_props_wrapping2: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'hoist' } },
  example_props_wrapping_children: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'hoist' } },
  example_props_wrapping_children2: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'hoist' } },

  // --- Smart entry strategy ---
  example_qwik_router_client: {
    filename: '../node_modules/@qwik.dev/router/index.qwik.mjs',
    entryStrategy: { type: 'smart' },
    explicitExtensions: true,
  },

  // --- Self-referential component migration (output has multiple segments with JSX) ---
  example_self_referential_component_migration: { transpileTs: true, transpileJsx: true },

  // --- HMR test ---
  // hmr already listed above with transpileTs + transpileJsx

  // --- Inline + transpile (inferred from output: .js, _noopQrl, no ENTRY POINT) ---
  inlined_qrl_uses_identifier_reference_when_hoisted_snapshot: { transpileTs: true, transpileJsx: true, entryStrategy: { type: 'inline' } },

  // --- Multi-input test (no INPUT section in snapshot, uses transform_modules directly) ---
  // relative_paths uses: srcDir='/path/to/app/src/thing', rootDir='/path/to/app/',
  // minify=simplify, explicitExtensions=true, mode='lib', entry=segment, transpileTs=true, transpileJsx=true
  relative_paths: {
    srcDir: '/path/to/app/src/thing',
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    entryStrategy: { type: 'segment' },
  },
};

// ---------------------------------------------------------------------------
// Helper to merge snapshot options with defaults
// ---------------------------------------------------------------------------

/**
 * Get the full TransformModulesOptions for a snapshot test.
 * Merges per-snapshot overrides with defaults.
 */
export function getSnapshotTransformOptions(
  snapshotName: string,
  inputCode: string,
): TransformModulesOptions {
  const overrides = SNAPSHOT_OPTIONS[snapshotName] ?? {};
  const filename = overrides.filename ?? DEFAULT_OPTIONS.filename;
  const srcDir = overrides.srcDir ?? DEFAULT_OPTIONS.srcDir;

  return {
    input: [{ path: filename, code: inputCode }],
    srcDir,
    transpileTs: overrides.transpileTs ?? DEFAULT_OPTIONS.transpileTs,
    transpileJsx: overrides.transpileJsx ?? DEFAULT_OPTIONS.transpileJsx,
    mode: overrides.mode ?? DEFAULT_OPTIONS.mode,
    entryStrategy: overrides.entryStrategy ?? DEFAULT_OPTIONS.entryStrategy,
    minify: overrides.minify ?? DEFAULT_OPTIONS.minify,
    explicitExtensions: overrides.explicitExtensions,
    preserveFilenames: overrides.preserveFilenames,
    isServer: overrides.isServer,
    stripExports: overrides.stripExports,
    stripCtxName: overrides.stripCtxName,
    regCtxName: overrides.regCtxName,
    stripEventHandlers: overrides.stripEventHandlers,
    scope: overrides.scope,
  };
}
