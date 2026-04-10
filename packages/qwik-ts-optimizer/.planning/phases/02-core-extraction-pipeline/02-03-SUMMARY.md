---
phase: 02-core-extraction-pipeline
plan: 03
subsystem: optimizer
tags: [extraction, segment-codegen, rewrite-calls, qrl, ast-traversal]

requires:
  - phase: 01-test-infrastructure
    provides: "naming utilities (buildDisplayName, buildSymbolName, qwikHash)"
  - phase: 02-plan-01
    provides: "types (SegmentAnalysis, TransformOutput), rewriteImportSource()"
  - phase: 02-plan-02
    provides: "ContextStack class, marker detection (isMarkerCall, collectImports, etc.)"
provides:
  - "extractSegments() - core extraction engine that walks AST and finds marker calls"
  - "ExtractionResult interface - complete segment extraction data"
  - "generateSegmentCode() - segment module code generation"
  - "getQrlCalleeName() - marker-to-Qrl callee transformation"
  - "buildQrlDeclaration() - QRL const declaration generation"
  - "buildSyncTransform() - sync$ inline transformation"
  - "needsPureAnnotation() - PURE annotation determination"
  - "getQrlImportSource() - import source for Qrl callees"
affects: [02-04-parent-assembly, 02-05-transform-api]

tech-stack:
  added: []
  patterns: [ast-walk-with-context-stack, segment-import-filtering, call-form-rewriting]

key-files:
  created:
    - src/optimizer/extract.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/rewrite-calls.ts
    - tests/optimizer/extract.test.ts
    - tests/optimizer/rewrite-calls.test.ts
  modified: []

decisions:
  - "Context stack push includes callee name for marker calls (e.g., component$ pushed onto stack before recording extraction, producing display names like App_component)"
  - "Segment import detection uses simple identifier collection within AST subtree cross-referenced against imports map"
  - "Extension determination walks the argument AST subtree for JSXElement/JSXFragment nodes"

metrics:
  duration: "4min"
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
  tests_added: 24
  tests_passing: 127
---

# Phase 02 Plan 03: Extraction Engine, Segment Codegen, and Call Form Rewriting Summary

Core extraction engine that walks AST with oxc-walker, finds marker calls via marker-detection, extracts segment info with ContextStack naming, generates segment modules, and provides call form rewriting utilities for all marker-to-Qrl transformations.

## What Was Built

### src/optimizer/extract.ts
- `extractSegments(source, relPath, scope?)` - parses source with oxc-parser, walks AST with oxc-walker, finds all marker calls, returns ExtractionResult array
- `ExtractionResult` interface - complete extraction data including positions, body text, naming, metadata, and segment imports
- Context stack integration: pushes VariableDeclarator, FunctionDeclaration, Property, MethodDefinition, JSXOpeningElement, JSXAttribute ($-suffixed), ExportDefaultDeclaration, and the marker callee name itself
- Extension determination: walks argument AST subtree for JSXElement/JSXFragment to decide .tsx vs .ts vs .js
- Segment import filtering: collects identifiers in segment body, cross-references against imports map

### src/optimizer/segment-codegen.ts
- `generateSegmentCode(extraction, nestedQrlDecls?)` - produces segment module string
- Groups imports by source, rewrites via rewriteImportSource(), adds separator comments, exports segment body

### src/optimizer/rewrite-calls.ts
- `getQrlCalleeName(markerName)` - transforms marker names to Qrl equivalents
- `buildQrlDeclaration(symbolName, canonicalFilename)` - generates QRL const with PURE annotation
- `buildSyncTransform(originalFnText)` - inline sync$ to _qrlSync(fn, "minified")
- `needsPureAnnotation(qrlCalleeName)` - true for componentQrl and qrl only
- `getQrlImportSource(qrlCalleeName)` - @qwik.dev/react for qwikifyQrl, @qwik.dev/core for rest

## Test Coverage

24 new tests across 2 test files:
- **extract.test.ts (11 tests):** component$ extraction, bare $, useTask$, JSX extension detection, non-JSX extension, ctxKind/ctxName, loc field, sync$ extraction, segment import filtering, generateSegmentCode with/without imports
- **rewrite-calls.test.ts (13 tests):** getQrlCalleeName for all marker types, buildQrlDeclaration format, buildSyncTransform format, needsPureAnnotation true/false cases, getQrlImportSource for react/core

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Context stack missing callee name push**
- **Found during:** Task 1 GREEN phase
- **Issue:** displayName was "test.tsx_App" instead of "test.tsx_App_component" because the marker callee name was not pushed onto the context stack before recording the extraction
- **Fix:** Added ctx.push(calleeName) when entering a marker CallExpression, changed pushedNodes from Set to Map<node, pushCount> to track multiple pushes per node
- **Files modified:** src/optimizer/extract.ts
- **Commit:** 992a044

**2. [Rule 1 - Bug] Test regex didn't match multiline function text**
- **Found during:** Task 2 GREEN phase
- **Issue:** Regex `/.+/` doesn't match newlines in the buildSyncTransform test
- **Fix:** Changed to `/[\s\S]+/` to match across lines
- **Files modified:** tests/optimizer/rewrite-calls.test.ts
- **Commit:** dce0179

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 992a044 | feat(02-03): extraction engine and segment codegen |
| 2 | dce0179 | feat(02-03): call form rewriting utilities |

## Self-Check: PASSED

All 5 files found. Both commits verified (992a044, dce0179). 127 tests passing.
