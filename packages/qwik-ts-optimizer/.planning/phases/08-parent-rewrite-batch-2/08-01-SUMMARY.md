---
phase: 08-parent-rewrite-batch-2
plan: 01
subsystem: optimizer
tags: [typescript-stripping, capture-suppression, parent-rewrite, oxc-transform]

requires:
  - phase: 07-parent-rewrite-batch-1
    provides: "inline strategy, .s() body transformation, JSX transpilation, hoist pattern"
provides:
  - "TS type stripping as final step in parent output when transpileTs=true"
  - "Capture suppression for _auto_ migrated variables in .w() wrapping"
affects: [08-parent-rewrite-batch-2]

tech-stack:
  added: []
  patterns:
    - "TS stripping via oxcTransformSync as post-processing final step on parent output"
    - "migratedNames Set built from reexport MigrationDecisions to filter .w() captures"

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts

key-decisions:
  - "Filter reexport (not move) migration decisions for capture suppression -- reexported vars get _auto_ exports, moved vars are physically relocated"
  - "TS stripping is absolute final step after all magic-string ops and preamble assembly"

patterns-established:
  - "Capture suppression pattern: build migratedNames Set from reexport decisions, filter effectiveCaptures before .w() assembly"

requirements-completed: [SC-1, SC-2, SC-3]

duration: 3min
completed: 2026-04-11
---

# Phase 08 Plan 01: TS Stripping and Capture Suppression Summary

**Added transpileTs parameter for TS type stripping from parent output and capture suppression for _auto_ migrated variables, gaining 6 new convergence tests (27 total passing)**

## Changes Made

### Task 1: TS stripping + capture suppression in rewrite-parent.ts

Added `transpileTs?: boolean` parameter to `rewriteParentModule`. When true, after all magic-string operations complete, the final output string is passed through `oxcTransformSync` to strip TypeScript type annotations.

Built `migratedNames` Set from migration decisions with action `'reexport'`, filtering their `varName` values. In Step 4b (.w() wrapping), `effectiveCaptures` filters out any capture name in `migratedNames`, skipping .w() entirely when no effective captures remain.

**Commit:** be031f4

### Task 2: Wire transpileTs from transform.ts

Passed `options.transpileTs` as the new final argument to the `rewriteParentModule()` call in transform.ts, completing the option threading from caller to implementation.

**Commit:** 4d1916a

## Verification

- Convergence tests: 27 passing (up from 21), zero regressions
- Unit tests: 473 passing, zero regressions
- New passing tests include: should_keep_non_migrated_binding_from_shared_array_destructuring_declarator, should_keep_non_migrated_binding_from_shared_destructuring_declarator, should_keep_non_migrated_binding_from_shared_destructuring_with_default, should_keep_non_migrated_binding_from_shared_destructuring_with_rest, should_keep_root_var_used_by_export_decl_and_qrl, should_keep_root_var_used_by_exported_function_and_qrl

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected migration action filter from 'migrate' to 'reexport'**
- **Found during:** Task 1
- **Issue:** Plan pseudocode used `d.action === 'migrate'` and `d.name`, but actual MigrationDecision type uses `action: 'reexport'` and `varName`
- **Fix:** Used correct field names from the actual type definition
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** be031f4

## Self-Check: PASSED
