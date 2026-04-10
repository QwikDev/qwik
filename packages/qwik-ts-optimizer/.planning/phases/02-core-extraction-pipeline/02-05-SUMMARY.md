---
phase: 02-core-extraction-pipeline
plan: 05
subsystem: optimizer-api
tags: [transform, integration, snapshots, public-api]
dependency_graph:
  requires: [02-03, 02-04]
  provides: [transformModule-api, snapshot-validation-framework]
  affects: [src/optimizer/transform.ts, src/optimizer/extract.ts, src/optimizer/rewrite-parent.ts, src/optimizer/marker-detection.ts]
tech_stack:
  added: []
  patterns: [public-api-entry-point, snapshot-batch-validation, parent-vs-segment-separation]
key_files:
  created:
    - src/optimizer/transform.ts
    - tests/optimizer/transform.test.ts
    - tests/optimizer/snapshot-batch.test.ts
  modified:
    - src/optimizer/marker-detection.ts
    - src/optimizer/extract.ts
    - src/optimizer/rewrite-parent.ts
key_decisions:
  - "canonicalFilename includes file stem prefix: displayName + '_' + hash (e.g., test.tsx_App_component_abc123)"
  - "Only top-level (non-nested) extractions get QRL declarations and imports in the parent module"
  - "QWIK_CORE_PREFIXES expanded to include @qwik.dev/react, @qwik.dev/router, and legacy equivalents"
  - "Snapshot batch tests split into full-match (parent+segments) and parent-only-match categories"
metrics:
  duration: 7min
  completed: 2026-04-10
  tasks: 2
  files: 6
  tests_added: 14
  tests_total: 153
---

# Phase 02 Plan 05: transformModule() Public API and Snapshot Validation Summary

Wire everything together into the public transformModule() API and validate against the snapshot corpus -- transformModule() accepts TransformModulesOptions, orchestrates extraction/rewriting/codegen, and returns TransformOutput with 2 full snapshot matches and 26 parent-module matches across the 209-file corpus.

## Task Results

### Task 1: transformModule() public API
**Commit:** 858260b

Created `src/optimizer/transform.ts` as the public entry point for the optimizer.

- Wires `extractSegments()`, `rewriteParentModule()`, and `generateSegmentCode()` into a single `transformModule(options)` function
- Builds parent module (isEntry=true, segment=null) plus segment modules (isEntry=false, segment=SegmentAnalysis)
- Handles nested QRL declarations: child segments get QRL decls passed to `generateSegmentCode()`
- Detects isTypeScript/isJsx flags from file extensions
- Accepts but defers entryStrategy, mode, stripExports, isServer options to later phases

### Task 2: Integration tests and snapshot batch validation
**Commit:** 9d74299

Created two test files plus fixed three bugs discovered during integration:

**Tests created:**
- `tests/optimizer/transform.test.ts` -- 8 integration tests covering component$, bare $(), sync$, import rewriting, multiple segments, metadata correctness, language flags
- `tests/optimizer/snapshot-batch.test.ts` -- 6 snapshot corpus tests: 2 full matches (issue_117, special_jsx) + 4 parent-only matches (example_2, example_4, example_5, example_of_synchronous_qrl)

**Bugs fixed during TDD:**
1. **Marker detection scope** -- `QWIK_CORE_PREFIXES` only included `@qwik.dev/core` and `@builder.io/qwik`, missing react/router packages. `qwikify$` from `@builder.io/qwik-react` was not being extracted.
2. **canonicalFilename missing file stem** -- `canonicalFilename` was set to `symbolName` (e.g., `App_component_abc123`) but should be `displayName + '_' + hash` (e.g., `test.tsx_App_component_abc123`).
3. **Nested QRL declarations in parent** -- All non-sync extractions got QRL declarations in the parent module, but only top-level ones should. Nested QRL declarations belong in their parent segment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] QWIK_CORE_PREFIXES missing react/router packages**
- **Found during:** Task 2 (snapshot validation)
- **Issue:** `qwikify$` from `@builder.io/qwik-react` was not detected as a marker function
- **Fix:** Added `@qwik.dev/react`, `@qwik.dev/router`, `@builder.io/qwik-react`, `@builder.io/qwik-city` to QWIK_CORE_PREFIXES
- **Files modified:** src/optimizer/marker-detection.ts
- **Commit:** 9d74299

**2. [Rule 1 - Bug] canonicalFilename missing file stem prefix**
- **Found during:** Task 2 (snapshot hash comparison)
- **Issue:** canonicalFilename was `symbolName` but should be `displayName + '_' + hash` to include the file stem
- **Fix:** Changed `canonicalFilename: symbolName` to `canonicalFilename: displayName + '_' + hash`
- **Files modified:** src/optimizer/extract.ts
- **Commit:** 9d74299

**3. [Rule 1 - Bug] Nested extractions leaking QRL declarations into parent**
- **Found during:** Task 2 (example_2 parent module comparison)
- **Issue:** All non-sync extractions got QRL declarations and imports in the parent module, but only top-level ones should
- **Fix:** Filtered QRL declarations and import generation to `topLevel` extractions only (parent === null)
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** 9d74299

## Corpus Coverage

| Category | Count | Notes |
|----------|-------|-------|
| Full match (parent + segments) | 2/209 | issue_117, special_jsx |
| Parent-only match | 26/209 | Segment mismatches due to nested call rewriting, variable migration |
| Remaining | 183/209 | Require captures, JSX transforms, signals, entry strategies (Phase 3-6) |

## Self-Check: PASSED

All files exist, all commits verified, 153 tests passing.
