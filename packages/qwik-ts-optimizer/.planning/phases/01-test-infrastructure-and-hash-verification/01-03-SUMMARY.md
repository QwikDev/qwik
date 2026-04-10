---
phase: 01-test-infrastructure-and-hash-verification
plan: 03
subsystem: testing
tags: [ast-compare, metadata-compare, batch-runner, oxc-parser, fast-deep-equal, locking]

# Dependency graph
requires:
  - "01-01: snapshot-parser (parseSnapshot, SegmentMetadata types)"
provides:
  - "AST comparison: compareAst() for semantic equivalence checking"
  - "Metadata comparison: compareMetadata() for field-by-field SegmentMetadata validation"
  - "Batch runner: runBatch() with lock file mechanism for regression prevention"
affects: [phase-02, phase-03]

# Tech tracking
added: [fast-deep-equal]
patterns: [tdd-red-green, semantic-ast-comparison, batch-locking-strategy]

# Key files
created:
  - src/testing/ast-compare.ts
  - src/testing/metadata-compare.ts
  - src/testing/batch-runner.ts
  - tests/testing/ast-compare.test.ts
  - tests/testing/metadata-compare.test.ts
  - tests/testing/batch-runner.test.ts
modified: []

# Decisions
key-decisions:
  - "stripPositions removes start/end/loc/range from AST nodes for whitespace-insensitive comparison"
  - "Metadata optional fields (paramNames, captureNames) compared via JSON.stringify for deep equality"
  - "Lock file uses sorted deduplicated JSON array, append-only semantics"

# Metrics
duration: 3min
completed: "2026-04-10"
tasks_completed: 3
tasks_total: 3
files_created: 6
files_modified: 0
tests_added: 24
tests_total: 66
---

# Phase 01 Plan 03: AST Comparison, Metadata Comparison, and Batch Runner Summary

Three tested utilities completing the test infrastructure: semantic AST comparison via oxc-parser + fast-deep-equal, field-level SegmentMetadata comparison with mismatch reporting, and a batch test runner with lock file mechanism for regression prevention.

## What Was Built

### AST Comparison Utility (`src/testing/ast-compare.ts`)
- `compareAst(expected, actual, filename)` parses both strings with oxc-parser, strips position data (start/end/loc/range), and deep-compares using fast-deep-equal
- Returns `AstCompareResult` with match status and any parse errors
- Correctly handles whitespace differences, JSX, arrow functions, and parse errors

### Metadata Comparison Utility (`src/testing/metadata-compare.ts`)
- `compareMetadata(expected, actual)` compares all 15 fields of SegmentMetadata
- 12 simple fields compared by identity, loc compared element-wise, paramNames/captureNames compared via JSON serialization
- Returns all mismatches with field name, expected value, and actual value

### Batch Test Runner (`src/testing/batch-runner.ts`)
- `runBatch(config, testFn?)` processes snapshot batches with optional custom test function
- `getSnapshotFiles()` and `getBatchFiles()` handle file discovery and slicing
- `loadLockedSnapshots()`, `saveLockedSnapshots()`, `lockPassingSnapshots()` implement the append-only lock file mechanism
- Locked snapshots are skipped (marked as passed without calling testFn)
- All 209 snapshots parse successfully across 21 batches

## Decisions Made

1. **AST position stripping**: Remove `start`, `end`, `loc`, and `range` fields recursively from all AST nodes before comparison. This makes comparison insensitive to whitespace and formatting differences while preserving semantic structure.

2. **Metadata optional field comparison**: Use `JSON.stringify` for paramNames and captureNames arrays. This handles undefined vs defined comparison and preserves order sensitivity for paramNames.

3. **Lock file format**: Sorted, deduplicated JSON array of filenames. Append-only semantics -- `lockPassingSnapshots` never removes entries, only adds new passing snapshots.

## Task Execution

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | AST comparison utility | 50c2718 | src/testing/ast-compare.ts, tests/testing/ast-compare.test.ts |
| 2 | Metadata comparison utility | dbd7876 | src/testing/metadata-compare.ts, tests/testing/metadata-compare.test.ts |
| 3 | Batch test runner with locking | 16f74ee | src/testing/batch-runner.ts, tests/testing/batch-runner.test.ts |

## Test Results

- 24 new tests added (8 per utility)
- 66 total tests passing (42 existing + 24 new)
- All 209 snapshots parse in batch mode without errors
- Zero regressions

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

All 6 files found. All 3 commit hashes verified.
