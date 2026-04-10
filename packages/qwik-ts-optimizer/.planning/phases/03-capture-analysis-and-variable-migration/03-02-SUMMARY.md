---
phase: 03-capture-analysis-and-variable-migration
plan: 02
subsystem: optimizer
tags: [variable-migration, side-effects, destructuring, module-level-declarations]

# Dependency graph
requires:
  - phase: 02-core-extraction-pipeline
    provides: ExtractionResult with argStart/argEnd ranges
provides:
  - analyzeMigration() decision tree for move/reexport/keep
  - collectModuleLevelDecls() for AST-based declaration collection
  - computeSegmentUsage() for segment vs root identifier attribution
  - MigrationDecision and ModuleLevelDecl type interfaces
affects: [03-03-capture-injection-codegen, phase-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [conservative-side-effect-detection, range-based-usage-attribution]

key-files:
  created:
    - src/optimizer/variable-migration.ts
    - tests/optimizer/variable-migration.test.ts
  modified: []

key-decisions:
  - "Conservative side-effect detection: only literals, arrow/function expressions, template literals without expressions, and object/array with all-safe values are safe"
  - "Range-based usage attribution: identifier position checked against extraction argStart..argEnd to determine segment vs root usage"

patterns-established:
  - "Migration decision tree: exported->reexport, root-used->reexport, multi-segment->reexport, side-effects->reexport, shared-destructuring->reexport, single-use-safe->move, unused->keep"
  - "Side-effect safety whitelist: Literal, ArrowFunctionExpression, FunctionExpression, TemplateLiteral (no expressions), ObjectExpression/ArrayExpression (recursive safe check)"

requirements-completed: [MIG-01, MIG-02, MIG-03, MIG-04, MIG-05]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 03 Plan 02: Variable Migration Analysis Summary

**Decision tree for module-level variable migration: move single-use safe vars into segments, re-export shared/exported/side-effect vars as _auto_VARNAME, keep unused vars at root**

## What Was Built

### analyzeMigration() — Decision Tree (MIG-01 through MIG-05)

Implements the complete decision tree from RESEARCH.md Pattern 6:

1. Exported + used by segment -> `reexport` (MIG-03: never migrate exported)
2. Exported + not used -> `keep`
3. Used by root code + segment -> `reexport`
4. Used by multiple segments -> `reexport` (MIG-02)
5. Has side effects -> `reexport` (MIG-04)
6. Part of shared destructuring -> `reexport` (MIG-05)
7. Single-use safe variable -> `move` with targetSegment (MIG-01)
8. Not used by any segment -> `keep`

### collectModuleLevelDecls() — Declaration Collector

Walks program.body to collect VariableDeclaration, FunctionDeclaration, and ClassDeclaration nodes. For each:
- Extracts all binding names (handles destructuring via recursive pattern walk)
- Determines `isExported` from ExportNamedDeclaration wrapper
- Determines `hasSideEffects` conservatively (whitelist approach)
- Determines `isPartOfSharedDestructuring` for multi-binding patterns

### computeSegmentUsage() — Usage Attribution

Walks entire AST collecting Identifier references. Each identifier is attributed to a segment (if within argStart..argEnd range) or to root (if outside all ranges). Returns both maps for analyzeMigration().

## Test Coverage

23 tests across 3 describe blocks:
- **analyzeMigration**: 11 tests covering all decision tree paths
- **collectModuleLevelDecls**: 10 tests for side-effect detection, exports, destructuring
- **computeSegmentUsage**: 2 tests for range-based attribution

Total suite: 189 tests, all passing.

## Deviations from Plan

None - plan executed exactly as written.

## Task Commits

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 (RED) | test | 9ef6f8b | Failing tests for variable migration analysis |
| 1 (GREEN) | feat | 9dd649e | Implement variable migration analysis module |

## Self-Check: PASSED
