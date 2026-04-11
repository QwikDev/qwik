---
phase: 16-final-convergence
plan: 03
subsystem: segment-codegen, transform
tags: [dead-code-elimination, dev-mode, qrlDEV, side-effect-simplification, convergence]
dependency_graph:
  requires: [transpileJsx-aware-import-cleanup, event-prop-constProps-classification]
  provides: [segment-const-replacement, segment-DCE, segment-side-effect-simplification, segment-qrlDEV]
  affects: [convergence-tests, segment-output, parent-output]
tech_stack:
  added: []
  patterns: [segment-const-replacement-pipeline, iterative-DCE-with-brace-tracking, binary-expression-comma-simplification]
key_files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/segment-codegen.ts
decisions:
  - "Const replacement (isServer/isBrowser) applied to segment bodies as post-processing step after code generation"
  - "DCE uses iterative pattern matching with brace depth tracking for nested block handling"
  - "Side-effect simplification converts unused const bindings to expression statements; binary expressions become comma expressions"
  - "false && expr simplified by finding expression end via brace/angle/paren depth tracking"
  - "Parent module DCE applied after const replacement to eliminate dead branches in non-extracted code"
  - "Segment nested QRL declarations switch to buildQrlDevDeclaration when emitMode is dev"
  - "qrlDEV vs qrl import selection based on content detection in nested decl strings"
  - "JSX devOptions threaded through SegmentJsxOptions to enable source info in segment body JSX"
metrics:
  duration: 10min
  completed: "2026-04-11T16:22:00Z"
  tasks: 2
  files: 2
---

# Phase 16 Plan 03: Dead Code Elimination, Dev Mode qrlDEV, and Side-Effect Simplification Summary

Segment body const replacement pipeline, iterative DCE with brace tracking, unused binding simplification to expression statements, and qrlDEV emission with JSX source info for dev mode segments.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Dead code elimination and side-effect simplification in segment bodies | 5d8c013 | src/optimizer/transform.ts |
| 2 | Emit qrlDEV() format in dev mode segments | fa8b4ac | src/optimizer/transform.ts, src/optimizer/segment-codegen.ts |

## What Changed

### Task 1: Dead Code Elimination and Side-Effect Simplification

- **Const replacement for segments**: Applied `isServer`/`isBrowser` const replacement to segment bodies as a post-processing step. Previously only the parent module had const replacement via `replaceConstants()`. Now segments parse their generated code, find Qwik imports of `isServer`/`isBrowser`, and replace all references with boolean literals.

- **Improved DCE**: Replaced the simple `if(false) { ... }` regex (which couldn't handle nested braces) with an iterative DCE that:
  - Tracks brace depth for correct nested block handling
  - Handles `if(true) { body }` by unwrapping the body
  - Handles `if(false) { ... } else { body }` by keeping else body
  - Simplifies `true && expr` to `expr` and `false && expr` to `false`
  - Uses expression-end detection with JSX angle bracket tracking for `false && <Component>...</Component>`

- **Side-effect simplification**: Parses the export body of segment code, finds const variable declarations where the binding is unreferenced, and:
  - `const x = expr.prop;` becomes `expr.prop;` (member expression)
  - `const x = fn();` becomes `fn();` (call expression)
  - `const x = a + b;` becomes `a, b;` (binary expression to comma expression)
  - Skips class expressions, function expressions, arrow functions
  - Skips the export const declaration itself

- **Parent DCE**: Applied the same DCE to parent module output (after const replacement turns isServer/isBrowser to true/false), fixing patterns like `functionThatNeedsWindow = () => { if(false) { ... } }` to `functionThatNeedsWindow = () => { }`.

### Task 2: Dev Mode qrlDEV Emission

- **Nested QRL declarations**: When `emitMode === 'dev'` and `devFile` is available, nested QRL declarations in segments now use `buildQrlDevDeclaration` instead of `buildQrlDeclaration`, producing `qrlDEV()` calls with `{ file, lo, hi, displayName }` metadata.

- **Import switching**: Segment import generation detects whether nested QRL declarations use `qrlDEV` (via string content check) and imports `qrlDEV` from `@qwik.dev/core` instead of `qrl`.

- **JSX source info threading**: Added `devOptions` field to `SegmentJsxOptions` interface. When in dev mode, the segment JSX transform receives `devOptions: { relPath }`, enabling `_jsxSorted` calls to include `{ fileName, lineNumber, columnNumber }` source info as the final argument.

## Test Results

- **Convergence: 66/210 passing** (unchanged from baseline)
- **Unit tests: 462/465 passing** (3 pre-existing failures, zero regressions)

## Why Convergence Count Didn't Increase

The changes are structurally correct and produce expected output patterns. However, convergence count remained at 66 because affected tests have **compound failures** -- multiple independent issues must all be fixed before a test flips from fail to pass.

Specific analysis:
- **example_build_server**: Segment body now correct (dead branches eliminated, imports cleaned). Parent still has duplicate Qwik import (rewriter import + surviving user import) and the `isServer`/`isb` import from `@qwik.dev/core/build` isn't removed.
- **example_10**: Segment body side-effect simplification produces correct output (`ident1.no;` and `ident1, ident3;`). Parent still has structural issues.
- **example_dev_mode**: Segment now emits `qrlDEV()` with location metadata and JSX source info. But `lo`/`hi` byte offsets differ from Rust (segment body offsets vs original source offsets) and flags computation differs (1 vs 3).
- **example_strip_server_code**: Parent and segment both have multiple pre-existing issues beyond DCE scope.

Each fix eliminates one failure mode from compound-failing tests, making future fixes more effective.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parent module DCE missing**
- **Found during:** Task 1
- **Issue:** Parent module had `if(false)` blocks left after const replacement but no DCE step to eliminate them
- **Fix:** Applied `applySegmentDCE` to parent module output before import cleanup
- **Files modified:** src/optimizer/transform.ts
- **Commit:** 5d8c013

## Deferred Items

- Parent module duplicate Qwik import (rewriter-generated import + surviving user import)
- `isServer`/`isBrowser` import removal from segments after const replacement (import cleanup runs but const import sources may need special handling)
- Byte-offset (`lo`/`hi`) accuracy in segment qrlDEV metadata (currently uses extraction loc which may not match Rust's byte positions)
- JSX lineNumber/columnNumber accuracy in segment bodies (offset by wrapper position)
- Flags computation (1 vs 3) for component elements in JSX transform

## Self-Check: PASSED
