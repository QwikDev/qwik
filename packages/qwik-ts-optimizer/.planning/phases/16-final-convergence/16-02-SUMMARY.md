---
phase: 16-final-convergence
plan: 02
subsystem: parent-rewrite, jsx-transform
tags: [import-cleanup, event-props, convergence]
dependency_graph:
  requires: [segment-body-w-wiring, segment-section-ordering]
  provides: [transpileJsx-aware-import-cleanup, event-prop-constProps-classification]
  affects: [convergence-tests, parent-output, segment-output]
tech_stack:
  added: []
  patterns: [transpileJsx-conditional-import-preservation]
key_files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts
    - src/optimizer/jsx-transform.ts
decisions:
  - "preserveAll for Qwik imports gated on !transpileJsx -- when JSX is transpiled, user imports are fully stripped"
  - "removeUnusedImports receives transpileJsx flag for consistent import preservation behavior"
  - "q-d: and q-w: prefixes added to pre-rewritten event prop recognition alongside q-e:, q-ep:, q-dp:, q-wp:"
metrics:
  duration: 19min
  completed: "2026-04-11T16:09:00Z"
  tasks: 2
  files: 3
---

# Phase 16 Plan 02: Parent Import Cleanup and Event Prop Classification Summary

TranspileJsx-aware import stripping for parent module output and missing q-d:/q-w: prefix recognition in pre-rewritten event prop classification.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Strip leaked user imports from parent module output | 1b70497 | src/optimizer/rewrite-parent.ts, src/optimizer/transform.ts |
| 2 | Fix event handler prop classification in _jsxSorted arguments | cfac879 | src/optimizer/jsx-transform.ts |

## What Changed

### Task 1: TranspileJsx-Aware Import Stripping

- The `preserveAll` logic in `rewrite-parent.ts` preserves single-quoted Qwik imports with non-$-suffixed specifiers (e.g., `import { $, component$, useStore } from '@qwik.dev/core'`) to match Rust optimizer behavior
- However, when `transpileJsx` is enabled, the Rust optimizer does NOT preserve these imports -- they are fully stripped
- Added `!jsxOptions?.enableJsx` gate to the `preserveAll` condition so import preservation only applies when JSX is not being transpiled
- Added `transpileJsx` parameter to `removeUnusedImports` function for consistent behavior: when transpileJsx is true, unreferenced Qwik imports are removed normally instead of being preserved
- This fix is narrowly scoped: only affects tests with `transpileJsx: true` option

### Task 2: Event Prop Classification Fix

- Pre-rewritten event props in segment body JSX (produced by `transformSCallBody` / extraction rewriting) are classified into constProps or varProps based on prefix matching
- The prefix check at line 714 was missing `q-d:` (document scope) and `q-w:` (window scope) prefixes
- Only `q-e:`, `q-ep:`, `q-dp:`, `q-wp:` were recognized, causing `q-d:focus` and `q-w:click` to fall through to default prop classification and land in varProps (arg 1) instead of constProps (arg 2)
- Added `q-d:` and `q-w:` to the prefix check so all event handler types are correctly classified as constProps
- Verified fix on `should_convert_jsx_events` segment: `q-d:focus` and `q-w:click` now appear in constProps alongside `q-e:*` props

## Test Results

- **Convergence: 66/210 passing** (up from 65, +1)
- **Unit tests: 461/464 passing** (3 pre-existing failures, zero regressions)

## Why Convergence Count Only Increased by 1

### Task 1 Import Analysis

Extensive analysis of the 11 tests "hurt" by the surviving Qwik import (via `preserveAll`) showed that only `ternary_prop` would actually flip to passing if the import is removed -- the other 10 tests have additional parent body differences or segment mismatches preventing them from passing.

The import preservation behavior varies across Rust snapshots: some tests expect the original user import preserved (e.g., `example_functional_component` with `transpileJsx: false`), while others expect it removed (e.g., `ternary_prop` with `transpileJsx: true`). The `transpileJsx` flag was identified as the discriminator.

### Task 2 Compound Failures

The `q-d:`/`q-w:` classification fix is structurally correct but the affected tests (`should_convert_jsx_events`, `example_qwik_router_client`) have additional segment differences (flags, children formatting) that prevent them from passing. The fix eliminates one failure mode from these compound-failing tests.

## Deviations from Plan

### Plan vs Actual Approach

**1. [Plan deviation] Import stripping scope narrower than planned**
- **Plan expected:** Stripping all leaked user imports from parent output, targeting 10+ test improvements
- **Actual:** Import preservation behavior is intentionally inconsistent in the Rust optimizer (varies by `transpileJsx`). Full stripping causes regressions. Applied transpileJsx-aware conditional stripping instead.
- **Impact:** +1 test instead of +10, but zero regressions

**2. [Rule 1 - Bug] Missing event prop prefixes in JSX transform**
- **Found during:** Task 2 investigation
- **Issue:** `q-d:` and `q-w:` prefixes missing from pre-rewritten event prop detection
- **Fix:** Added both prefixes to the condition at line 714 of jsx-transform.ts
- **Files modified:** src/optimizer/jsx-transform.ts

## Deferred Items

- Parent-only failures from import quote style (single vs double quotes in surviving imports) -- cosmetic difference that AST comparison ignores but may need attention for string-exact matching
- `example_build_server` parent has duplicate Qwik import in body + missing DCE of `if(false)` blocks -- multiple compounding issues
- Flags computation differences (1 vs 3) in many parent-only failures with inline strategy
- Section ordering mismatch (_hf before QRL vs after) in derived signals tests

## Self-Check: PASSED
