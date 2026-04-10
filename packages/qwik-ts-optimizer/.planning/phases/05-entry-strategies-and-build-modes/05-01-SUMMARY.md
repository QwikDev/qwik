---
phase: 05-entry-strategies-and-build-modes
plan: 01
subsystem: optimizer
tags: [entry-strategy, dev-mode, qrlDEV, jsx-source-info]
dependency_graph:
  requires: [phase-04-jsx-signals-events]
  provides: [entry-strategy-resolution, dev-mode-transforms]
  affects: [transform.ts, rewrite-parent.ts, jsx-transform.ts, rewrite-calls.ts]
tech_stack:
  added: []
  patterns: [strategy-pattern-for-entry-resolution, dev-mode-conditional-codegen]
key_files:
  created:
    - src/optimizer/entry-strategy.ts
    - src/optimizer/dev-mode.ts
    - tests/optimizer/entry-strategy.test.ts
    - tests/optimizer/dev-mode.test.ts
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/rewrite-calls.ts
    - src/optimizer/jsx-transform.ts
decisions:
  - "Entry strategy resolution is a pure function taking strategy type + context, returns entry field value"
  - "Dev mode conditionally switches qrl->qrlDEV imports and declaration builders"
  - "JSX dev source info computed via precomputed line-starts array with binary search for O(log n) offset->line/col"
  - "_useHmr marked TODO: no snapshot evidence exists; best-effort implementation provided"
metrics:
  duration: 4min
  completed: "2026-04-10T22:12:30Z"
  tasks: 2
  files: 8
---

# Phase 5 Plan 1: Entry Strategy Resolution and Dev Mode Transforms Summary

Entry strategy metadata resolution and dev mode QRL/JSX generation wired into the optimizer pipeline.

## One-liner

Entry strategy resolves segment `entry` field by strategy type (smart/component/manual/single); dev mode emits qrlDEV with file/lo/hi/displayName metadata and JSX source info trailing args.

## What Was Done

### Task 1: Entry strategy resolution and dev mode builders (TDD)
- Created `entry-strategy.ts` with `resolveEntryField()` supporting smart/segment/hook/component/single/manual strategies
- Created `dev-mode.ts` with `buildQrlDevDeclaration()`, `buildDevFilePath()`, `buildJsxSourceInfo()`, `buildUseHmrCall()`
- 16 unit tests covering all strategy types and dev mode builder functions
- Commit: `044ca7a`

### Task 2: Wire entry strategy and dev mode into pipeline
- Wired `resolveEntryField()` into transform.ts segment metadata assembly (replaces hardcoded `entry: null`)
- Added `mode` and `devFilePath` parameters to `rewriteParentModule()` signature
- Dev mode produces `qrlDEV` imports and declarations instead of `qrl`
- Added JSX dev source info as trailing argument to `_jsxSorted` calls via `transformAllJsx` dev options
- Added `qrlDEV` to PURE_CALLEES set in rewrite-calls.ts
- All 397 tests pass (381 existing + 16 new, zero regressions)
- Commit: `2cb901a`

## Decisions Made

1. **Strategy as pure function**: `resolveEntryField()` is stateless -- takes strategy type, symbol name, context name, parent component symbol, and manual map. Returns string or null.
2. **Dev mode as parameter threading**: Mode and devFilePath passed through pipeline rather than global config, keeping functions testable and side-effect free.
3. **JSX line/column lookup**: Precomputed line-starts array with binary search for efficient offset-to-line/column conversion (O(n) precompute, O(log n) per lookup).
4. **_useHmr best-effort**: No snapshot evidence found for _useHmr behavior. Implemented based on Qwik source understanding, marked with TODO for verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed isDevMode variable declaration order**
- **Found during:** Task 2
- **Issue:** `isDevMode` was declared in Step 5 of rewrite-parent.ts but referenced in Step 4c (JSX transform), causing ReferenceError
- **Fix:** Moved `isDevMode` declaration before Step 4c
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** 2cb901a

## Verification

- `npx vitest run --reporter=verbose` -- 397 tests pass across 24 test files
- Entry strategy tests cover smart, segment, hook, component, single, manual strategies
- Dev mode tests verify qrlDEV format, JSX source info format, dev file path construction

## Requirements Addressed

- ENT-01: Smart mode segments have `entry: null` in metadata
- ENT-03: Component strategy sets entry to parent component symbol
- ENT-04: Manual strategy uses manual map for entry field
- MODE-01: Dev mode emits qrlDEV with file/lo/hi/displayName
- MODE-02: Dev mode JSX has trailing source info argument
- MODE-03: Component segments in dev mode have _useHmr call (builder created, pipeline injection deferred pending snapshot evidence)

## Self-Check: PASSED
