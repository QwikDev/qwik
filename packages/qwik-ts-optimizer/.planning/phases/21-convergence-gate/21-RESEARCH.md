# Phase 21: Convergence Gate - Research

**Researched:** 2026-04-11
**Domain:** Validation / measurement of v3.0 milestone convergence
**Confidence:** HIGH

## Summary

Phase 21 is a validation gate -- it measures whether the v3.0 milestone achieved its 70%+ convergence target. Running the convergence test suite today produces **76/210 vitest passes (74 real snapshot matches + 1 noInput early-return + 1 summary meta-test)**, which is **35.4% real convergence (74/209 snapshots)**. This is far below the 147+/210 (70%) target. [VERIFIED: `npx vitest run tests/optimizer/convergence.test.ts` executed 2026-04-11]

The v3.0 milestone (phases 17-20) improved convergence from the v2.0 baseline of 73/210 to 76/210, a net gain of **3 snapshot tests**. The gains came from: Phase 18 (+1, inlinedQrl capture fix), Phase 19 (+1, template string wrapping), Phase 20 (+1, variable migration/sync). While the infrastructure improvements (import ordering, shared SignalHoister, classifyProp alignment, variable migration scope filtering, _qrlSync serialization) are substantive, the convergence needle moved minimally because the remaining 134 failures have deeply interconnected root causes.

**Primary recommendation:** The gate does NOT pass. Document v3.0 results, categorize remaining failures, and plan a v4.0 milestone targeting the const_idents tracking system and cross-scope capture delivery that would unlock large batches of failures simultaneously.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | 147+/210 convergence tests pass (70%+ pass rate) | NOT MET: 76/210 pass (36.2%). Gap of 71 tests to reach 147. |
| CONV-02 | All 73 previously-passing tests still pass (zero regressions) | MET: All 73 v2.0 baseline tests still pass, plus 3 new passes (76 total). Zero regressions. |
| CONV-03 | Zero unit test regressions | PARTIAL: 5 non-convergence test failures exist: 2 are intentional behavior changes from Phase 19 (classifyProp alignment), 3 are pre-existing from v2.0. No new regressions introduced by v3.0. |
</phase_requirements>

## Current State (Measured 2026-04-11)

### Convergence Numbers
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Vitest passes | 76/210 | 147/210 | FAIL |
| Real snapshot matches | 74/209 | 146/209 | FAIL |
| Pass rate | 35.4% | 70%+ | FAIL (gap: 34.6 percentage points) |
| v2.0 baseline regressions | 0 | 0 | PASS |
| v3.0 net gain | +3 tests | +74 tests | FAIL |
| TypeScript compilation | 0 errors | 0 errors | PASS |
| Non-convergence test failures | 5 | 0 | PARTIAL (2 intentional, 3 pre-existing) |

[VERIFIED: All numbers from actual test runs executed during this research session]

### Failure Classification

| Category | Count | Description |
|----------|-------|-------------|
| Parent-only failures | 36 | Parent module AST differs but all segments match |
| Segment-only failures | 68 | Segments differ but parent module matches |
| Both parent + segment fail | 30 | Both parent and segments have mismatches |
| **Total failing** | **134** | |

[VERIFIED: Classification script run against all 209 snapshots]

### Non-Convergence Unit Test Failures (5 total)

| Test | File | Cause | Origin |
|------|------|-------|--------|
| classifyProp: member expression on imported value | jsx-transform.test.ts | Phase 19 intentional change (SWC alignment) | v3.0 |
| puts imported value props in constProps | jsx-transform.test.ts | Phase 19 intentional change (SWC alignment) | v3.0 |
| JSX segment metadata match (example_immutable_analysis) | snapshot-batch.test.ts | Pre-existing | v2.0 |
| loop: for-i loop q:p injected | transform.test.ts | Pre-existing | v2.0 |
| loop: parent-level .map() loop flag | transform.test.ts | Pre-existing | v2.0 |

[VERIFIED: `npx vitest run` output filtered for non-convergence failures]

## Root Cause Families for Remaining 134 Failures

Based on analysis of Phase 17-20 verification reports and the decisions logged in STATE.md:

### Family 1: const_idents Tracking (estimated impact: 40-60 tests)
**What:** SWC maintains a `const_idents` set tracking which identifiers are bound to module-scope `const` declarations. This determines:
- `computeFlags` bit 0 (static_listeners): should be `!hasNonConstProp` not `!inLoop || !hasVarProps`
- Component vs HTML prop routing: components should default props to var bucket, HTML to const
- `_wrapProp` children dynamic classification: depends on binding constness, not call form

**Why it matters:** Three planned Phase 19 changes had to be **reverted** because they caused regressions without const_idents. This single missing feature blocks convergence for a large batch of tests. Primarily affects parent-only and both-fail categories.

**Evidence:** Phase 19 verification (gap analysis), Phase 19 Plan 01 summary key-decisions [VERIFIED: 19-VERIFICATION.md]

### Family 2: Cross-Scope Capture Delivery (estimated impact: 15-25 tests)
**What:** CAP-02 remains Pending. Key patterns not working:
- `_rawProps` destructuring does not produce `_rawProps` as a single capture variable
- Nested `$()` calls lack `.w()` wrapping when they have captureNames
- Segment body codegen does not handle `_captures` injection for all component$ patterns

**Evidence:** Phase 18 verification gap analysis [VERIFIED: 18-VERIFICATION.md]

**Affected tests:** example_multi_capture, example_capture_imports, example_functional_component_capture_props, and related capture tests

### Family 3: Segment Body Codegen Mismatches (estimated impact: 30-50 tests)
**What:** Segment module code generation has various mismatches:
- Inline strategy `.s()` body text generation (capture injection, nested QRL rewriting, JSX transform ordering)
- Hoist strategy const-fn body generation
- Signal wrapping placement within segment bodies depends on const_idents

**Evidence:** Phase 17 verification (all 13 inline/hoist tests still fail), segment-only failure count of 68 [VERIFIED: 17-VERIFICATION.md, classification script]

### Family 4: Dev Mode / Special Mode Patterns (estimated impact: 10-15 tests)
**What:** Dev mode tests (example_dev_mode, example_dev_mode_inlined, example_noop_dev_mode, hmr, example_jsx_keyed_dev) have both parent and segment failures suggesting the `qrlDEV()` / HMR / dev-mode JSX source info transforms have cumulative mismatches.

**Evidence:** Both-fail category includes multiple dev mode tests [VERIFIED: classification output]

### Family 5: Import/Export Edge Cases (estimated impact: 10-20 tests)
**What:** Various import/export handling edge cases:
- example_exports, example_export_issue, example_renamed_exports (both-fail)
- example_qwik_react, example_qwik_router_client (import rewriting + segment issues)
- example_transpile_jsx_only, example_explicit_ext_no_transpile (extension handling)

**Evidence:** Both-fail category pattern analysis [VERIFIED: classification output]

### Overlap Note
These families are NOT independent. A single test can fail due to multiple families (e.g., const_idents affecting flags AND capture delivery affecting .w()). The estimated impacts sum to more than 134 because of this overlap. Fixing const_idents alone would likely flip 30-40 tests, not 40-60, because many also have segment issues from other families.

## What Would It Take to Reach 70%

To reach 147/210, we need 71 more passing tests. Based on the root cause analysis:

| Fix | Estimated New Passes | Confidence |
|-----|---------------------|------------|
| const_idents tracking system | 25-35 | MEDIUM - would fix flags + prop routing but many tests also have segment issues |
| Cross-scope capture delivery (CAP-02) | 10-15 | MEDIUM - specific _rawProps and nested $() patterns |
| Segment body codegen improvements | 15-25 | LOW - diverse issues, each fix helps a small batch |
| Dev mode transform alignment | 5-10 | MEDIUM - relatively contained subsystem |
| Import/export edge cases | 5-10 | MEDIUM - each is a specific edge case |
| **Optimistic total** | **60-95** | Would bring us to 134-169 (64-81%) |

**Assessment:** Reaching 70% is achievable but requires a focused v4.0 milestone with const_idents as the centerpiece. The const_idents system is the single highest-leverage improvement.

## Architecture Patterns

### Pattern 1: Convergence Gate as Measurement
**What:** Phase 21 runs existing tests and reports results -- no code changes
**When to use:** At milestone boundaries to validate progress
**Key artifact:** A verification report documenting exact numbers, failure categories, and gap analysis

### Pattern 2: Failure Triage Script
**What:** A diagnostic that classifies failures by parent-only / segment-only / both and groups them
**When to use:** Before planning the next convergence milestone
**Implementation:** Can be a one-off vitest test (like the classify-failures approach used in this research) or a permanent diagnostic command

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Failure classification | Manual inspection of 134 tests | Script that runs all snapshots and categorizes parent/segment/both/error | Too many tests for manual triage |
| AST diff visualization | Custom diff printer | compareAst already exists in test utilities | Infrastructure exists |

## Common Pitfalls

### Pitfall 1: Counting Vitest Passes vs Real Convergence
**What goes wrong:** Vitest reports 76/210 passes but this includes 1 noInput early-return and 1 summary meta-test
**Why it happens:** The convergence summary test always passes, and noInput tests pass by returning early
**How to avoid:** Track "real snapshot matches" (74/209) not vitest pass count (76/210)
**Warning signs:** Off-by-two in convergence numbers

### Pitfall 2: Treating Phase 19 Unit Test Failures as Regressions
**What goes wrong:** The 2 classifyProp test failures appear to be regressions but are intentional SWC-alignment changes
**Why it happens:** Tests expected `const` for imported member expressions but Phase 19 changed to match SWC (always `var`)
**How to avoid:** Update test expectations to match the new SWC-aligned behavior
**Warning signs:** classifyProp tests failing with const vs var mismatch

### Pitfall 3: Assuming Failure Families Are Independent
**What goes wrong:** Planning fixes for one family without realizing it won't flip the test because another family also affects it
**Why it happens:** Tests can fail for multiple independent reasons
**How to avoid:** When estimating impact, discount for overlap -- a test needs ALL its failure causes fixed to pass

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (if exists) or package.json |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | 147+/210 convergence pass | integration | `npx vitest run tests/optimizer/convergence.test.ts` | Yes |
| CONV-02 | 73 baseline tests still pass | integration | `npx vitest run tests/optimizer/convergence.test.ts` (check specific 73) | Yes |
| CONV-03 | Zero unit test regressions | unit | `npx vitest run` (exclude convergence failures) | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts` (< 1 second)
- **Per wave merge:** `npx vitest run` (< 3 seconds)
- **Phase gate:** Full suite green + convergence count verification

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The convergence test file, unit tests, and TypeScript compilation check all exist and work.

## v3.0 Milestone Results Summary

| Phase | Tests Before | Tests After | Net Gain | Key Achievement |
|-------|-------------|-------------|----------|-----------------|
| Phase 17 | 73 | 73 | 0 | Import ordering, shared SignalHoister infrastructure |
| Phase 18 | 73 | 74 | +1 | Alphabetical capture sort, inlinedQrl explicit captures |
| Phase 19 | 74 | 75 | +1 | classifyProp SWC alignment, _createElement fallback |
| Phase 20 | 75 | 76 | +1 | Variable migration scope filtering, _qrlSync serialization |
| **Total v3.0** | **73** | **76** | **+3** | Infrastructure for future convergence gains |

### v3.0 Infrastructure Gains (Not Reflected in Convergence Count)
While the test count only moved +3, v3.0 established critical infrastructure:
1. Import ordering uses Map insertion order (matches SWC discovery order)
2. Shared SignalHoister prevents _hf counter duplication
3. classifyProp aligned with SWC is_const.rs rules
4. Variable migration scope-aware filtering (local declarations, root declaration positions)
5. _qrlSync paren-depth-aware serialization
6. CONST_CALL_IDENTS set for known-const function calls in JSX
7. Moved declaration import dependency tracking

These are prerequisites for the larger convergence gains that const_idents tracking would unlock.

## Passing Tests (74 Snapshot Matches)

<details>
<summary>Full list of 74 passing snapshot tests</summary>

1. example_1
2. example_2
3. example_3
4. example_4
5. example_6
6. example_7
7. example_custom_inlined_functions
8. example_dead_code
9. example_default_export
10. example_default_export_index
11. example_default_export_invalid_ident
12. example_explicit_ext_transpile
13. example_fix_dynamic_import
14. example_functional_component
15. example_immutable_function_components
16. example_import_assertion
17. example_inlined_entry_strategy
18. example_jsx_keyed
19. example_optimization_issue_3561
20. example_preserve_filenames
21. example_segment_variable_migration
22. example_skip_transform
23. example_strip_exports_unused
24. example_strip_exports_used
25. example_transpile_ts_only
26. example_ts_enums
27. example_use_client_effect
28. example_with_style
29. example_with_tagname
30. inlined_qrl_uses_identifier_reference_when_hoisted_snapshot
31. issue_117
32. issue_476
33. issue_964
34. relative_paths
35. rename_builder_io
36. root_level_self_referential_qrl
37. should_convert_jsx_events
38. should_disable_qwik_transform_error_by_code
39. should_extract_multiple_qrls_with_item_and_index
40. should_ignore_passive_jsx_events_without_handlers
41. should_keep_module_level_var_used_in_both_main_and_qrl
42. should_keep_non_migrated_binding_from_shared_array_destructuring_declarator
43. should_keep_non_migrated_binding_from_shared_destructuring_declarator
44. should_keep_non_migrated_binding_from_shared_destructuring_with_default
45. should_keep_non_migrated_binding_from_shared_destructuring_with_rest
46. should_keep_root_var_used_by_export_decl_and_qrl
47. should_keep_root_var_used_by_exported_function_and_qrl
48. should_merge_bind_checked_and_on_input
49. should_merge_bind_value_and_on_input
50. should_merge_on_input_and_bind_checked
51. should_merge_on_input_and_bind_value
52. should_move_props_related_to_iteration_variables_to_var_props
53. should_not_inline_exported_var_into_segment
54. should_not_move_over_side_effects
55. should_not_wrap_ternary_function_operator_with_fn
56. should_not_wrap_var_template_string
57. should_preserve_non_ident_explicit_captures
58. should_split_spread_props
59. should_split_spread_props_with_additional_prop
60. should_split_spread_props_with_additional_prop2
61. should_transform_block_scoped_variables_and_item_index_in_loop
62. should_transform_block_scoped_variables_in_loop
63. should_transform_event_names_without_jsx_transpile
64. should_transform_loop_multiple_handler_with_different_captures
65. should_transform_multiple_block_scoped_variables_and_item_index_in_loop
66. should_transform_multiple_block_scoped_variables_in_loop
67. should_transform_nested_loops_handler_captures_only_inner_scope
68. should_transform_same_element_one_handler_with_captures_one_without
69. should_transform_two_handlers_capturing_different_block_scope_in_loop
70. should_work
71. should_wrap_type_asserted_variables_in_template
72. special_jsx
73. support_windows_paths
74. ternary_prop / transform_qrl_in_regular_prop (2 tests bringing total to 74+)

</details>

## Failing Tests by Category (134 Total)

### Parent-Only Failures (36)
Tests where parent module output differs but all segment outputs match. These are most likely to be fixed by const_idents tracking (flags bitmask, prop bucket routing).

example_10, example_build_server, example_derived_signals_children, example_derived_signals_cmp, example_derived_signals_complext_children, example_derived_signals_div, example_derived_signals_multiple_children, example_dev_mode_inlined, example_input_bind, example_issue_33443, example_issue_4438, example_lib_mode, example_missing_custom_inlined_functions, example_mutable_children, example_optimization_issue_3542, example_optimization_issue_3795, example_optimization_issue_4386, example_parsed_inlined_qrls, example_props_optimization, example_props_wrapping, example_props_wrapping2, example_props_wrapping_children, example_props_wrapping_children2, example_qwik_react_inline, example_reg_ctx_name_segments, example_reg_ctx_name_segments_hoisted, example_reg_ctx_name_segments_inlined, example_server_auth, example_strip_client_code, example_ts_enums_issue_1341, example_use_optimization, fun_with_scopes, issue_150, root_level_self_referential_qrl_inline, should_ignore_null_inlined_qrl, should_not_generate_conflicting_props_identifiers

### Segment-Only Failures (68)
Tests where segments differ but parent matches. Root causes span capture delivery, segment body codegen, signal wrapping in segments, and JSX transforms within segments.

component_level_self_referential_qrl, destructure_args_colon_props, destructure_args_colon_props2, destructure_args_colon_props3, example_5, example_8, example_capture_imports, example_capturing_fn_class, example_class_name, example_component_with_event_listeners_inside_loop, example_functional_component_2, example_functional_component_capture_props, example_getter_generation, example_immutable_analysis, example_invalid_segment_expr1, example_jsx_listeners, example_manual_chunks, example_multi_capture, example_of_synchronous_qrl, example_preserve_filenames_segments, example_prod_node, example_spread_jsx, example_strip_server_code, example_use_server_mount, hoisted_fn_signal_in_loop, impure_template_fns, issue_5008, issue_7216_add_test, lib_mode_fn_signal, moves_captures_when_possible, should_convert_passive_jsx_events, should_convert_rest_props, should_destructure_args, should_disable_multiple_rules_from_single_directive, should_disable_passive_warning_with_qwik_disable_next_line, should_extract_multiple_qrls_with_item_and_index_and_capture_ref, should_extract_single_qrl, should_extract_single_qrl_2, should_extract_single_qrl_with_index, should_extract_single_qrl_with_nested_components, should_handle_dangerously_set_inner_html, should_ignore_preventdefault_with_passive, should_make_component_jsx_split_with_bind, should_mark_props_as_var_props_for_inner_cmp, should_merge_attributes_with_spread_props, should_merge_attributes_with_spread_props_before_and_after, should_move_bind_value_to_var_props, should_not_transform_bind_checked_in_var_props_for_jsx_split, should_not_transform_bind_value_in_var_props_for_jsx_split, should_not_transform_events_on_non_elements, should_not_wrap_fn, should_only_disable_the_next_line, should_split_spread_props_with_additional_prop3, should_split_spread_props_with_additional_prop4, should_transform_component_with_normal_function, should_transform_handler_in_for_of_loop, should_transform_handlers_capturing_cross_scope_in_nested_loops, should_transform_multiple_event_handlers, should_transform_multiple_event_handlers_case2, should_transform_nested_loops, should_transform_passive_event_names_without_jsx_transpile, should_transform_qrls_in_ternary_expression, should_transform_three_nested_loops_handler_captures_outer_only, should_wrap_inner_inline_component_prop, should_wrap_logical_expression_in_template, should_wrap_object_with_fn_signal, should_wrap_prop_from_destructured_array, should_wrap_store_expression

### Both Parent + Segment Fail (30)
Tests where both parent and segments differ. These are the hardest to fix -- multiple independent issues must all be resolved.

destructure_args_inline_cmp_block_stmt, destructure_args_inline_cmp_block_stmt2, destructure_args_inline_cmp_expr_stmt, example_11, example_9, example_dev_mode, example_drop_side_effects, example_explicit_ext_no_transpile, example_export_issue, example_exports, example_invalid_references, example_jsx, example_jsx_import_source, example_jsx_keyed_dev, example_lightweight_functional, example_noop_dev_mode, example_qwik_conflict, example_qwik_react, example_qwik_router_client, example_renamed_exports, example_self_referential_component_migration, example_transpile_jsx_only, example_ts_enums_no_transpile, hmr, should_migrate_destructured_binding_with_imported_dependency, should_not_auto_export_var_shadowed_in_catch, should_not_auto_export_var_shadowed_in_do_while, should_not_auto_export_var_shadowed_in_labeled_block, should_not_auto_export_var_shadowed_in_switch, should_split_spread_props_with_additional_prop5

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | const_idents tracking would fix 25-35 tests | Root Cause Families | Impact could be higher or lower; need to implement and measure |
| A2 | Root cause families overlap significantly | Root Cause Families | If families are more independent, total addressable tests could be higher |
| A3 | The 2 Phase 19 unit test failures are intentional and should be updated | Non-convergence failures | If the SWC alignment was wrong, tests should be reverted instead |

## Open Questions

1. **Should v3.0 be considered "shipped" at 36% convergence?**
   - What we know: The gate criteria (70%) are not met
   - What's unclear: Whether the infrastructure gains justify closing v3.0 anyway
   - Recommendation: Ship v3.0 with documented results, plan v4.0 for const_idents

2. **Should the 2 Phase 19 unit test expectations be updated?**
   - What we know: Phase 19 intentionally changed classifyProp to match SWC
   - What's unclear: Whether the change is correct for all cases
   - Recommendation: Update test expectations to match SWC-aligned behavior (Phase 19 verification explicitly recommends this)

3. **What is the actual const_idents impact?**
   - What we know: 3 reverted changes in Phase 19 were blocked by lack of const_idents
   - What's unclear: Exactly how many of the 134 failures would be fixed
   - Recommendation: Implement const_idents as first task of v4.0, then re-measure

## Sources

### Primary (HIGH confidence)
- Convergence test run: `npx vitest run tests/optimizer/convergence.test.ts` -- 76/210 pass (2026-04-11)
- Full test suite run: `npx vitest run` -- 556/695 pass (2026-04-11)
- TypeScript compilation: `npx tsc --noEmit` -- 0 errors (2026-04-11)
- Classification script: custom vitest test categorizing parent/segment/both failures
- Phase 17-20 VERIFICATION.md files -- gap analysis and deferred items

### Secondary (MEDIUM confidence)
- Root cause family estimates based on Phase 19 key-decisions and verification gap analysis
- Overlap estimates based on failure category distribution

## Metadata

**Confidence breakdown:**
- Current state measurement: HIGH - direct test execution
- Failure classification: HIGH - automated categorization
- Root cause families: MEDIUM - based on verification reports, not per-test diagnosis
- Impact estimates: LOW-MEDIUM - would need implementation to verify

**Research date:** 2026-04-11
**Valid until:** Next code change (measurements are point-in-time)
