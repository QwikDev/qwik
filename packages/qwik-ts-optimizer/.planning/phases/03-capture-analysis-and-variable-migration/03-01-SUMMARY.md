---
phase: 03-capture-analysis-and-variable-migration
plan: 01
subsystem: capture-analysis
tags: [capture-detection, scope-analysis, oxc-walker, tdd]
dependency_graph:
  requires: [oxc-walker, oxc-parser]
  provides: [analyzeCaptures, collectParamNames, collectScopeIdentifiers, CaptureAnalysisResult]
  affects: [03-02-PLAN, 03-03-PLAN]
tech_stack:
  added: []
  patterns: [getUndeclaredIdentifiersInFunction for scope-aware capture detection, filter-against-parent-scope pattern]
key_files:
  created:
    - src/optimizer/capture-analysis.ts
    - tests/optimizer/capture-analysis.test.ts
  modified: []
decisions:
  - Used oxc-walker getUndeclaredIdentifiersInFunction() rather than hand-rolling scope analysis — returns string[] of undeclared identifiers in a function node
  - parentScopeIdentifiers is caller-provided Set<string> rather than auto-collected — keeps analyzeCaptures() pure and testable
  - Module-level variables handled by passing empty parentScopeIdentifiers — migration (not capture) handles them
metrics:
  duration: 2min
  completed: "2026-04-10T20:09:42Z"
  tasks: 1
  files: 2
  tests_added: 13
  tests_total: 166
---

# Phase 03 Plan 01: Capture Analysis Module Summary

Scope-aware capture detection using oxc-walker's getUndeclaredIdentifiersInFunction() with parent-scope filtering and import exclusion.

## What Was Built

### analyzeCaptures() — Core capture detection function

Takes a closure AST node (the $() argument), a set of parent scope identifiers, and a set of imported names. Uses `getUndeclaredIdentifiersInFunction()` from oxc-walker to get all identifiers referenced but not declared within the closure, then filters to only include names from the parent scope that are not imports. Returns alphabetically sorted `captureNames`, a `captures` boolean flag, and `paramNames`.

### collectParamNames() — Parameter binding extraction

Recursively walks parameter AST nodes to extract all binding names. Handles simple identifiers, destructured objects `{a, b}`, destructured arrays `[a, b]`, rest patterns `...rest`, nested patterns, and defaults `a = 1`.

### collectScopeIdentifiers() — Scope declaration collection helper

Walks an AST container node to collect all identifiers declared at that scope level. Handles VariableDeclaration, FunctionDeclaration, and parameter patterns.

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 (RED) | Failing tests for capture analysis | f5e0efb | test |
| 1 (GREEN) | Implement capture analysis module | c029425 | feat |

## Test Results

13 new tests, all passing. 166 total tests, zero regressions.

- 9 analyzeCaptures tests: simple capture, multiple sorted, globals excluded, imports excluded, var hoisting, destructured params, paramNames extraction, module-level empty, own params not captured
- 4 collectParamNames tests: simple identifiers, destructured objects, rest params, defaults

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED
