---
phase: 02-core-extraction-pipeline
verified: 2026-04-10T14:25:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 2: Core Extraction Pipeline Verification Report

**Phase Goal:** The optimizer can parse source files, detect marker functions, extract segments, rewrite parent modules, and produce the correct module structure
**Verified:** 2026-04-10T14:25:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Given a source file with `$()` calls, the optimizer produces separate segment modules with correct exported constants and deterministic names | VERIFIED | `extractSegments()` in extract.ts (352 lines) parses source via oxc-parser, walks AST with oxc-walker, finds marker calls, produces ExtractionResult with symbolName/displayName/hash. `generateSegmentCode()` in segment-codegen.ts produces segment modules with `export const {symbolName} = {bodyText}`. 11 extract tests + 2 full snapshot matches (issue_117, special_jsx) confirm. |
| 2 | The parent module is rewritten with QRL references replacing `$()` calls, including nested segments with correct parent-child relationships | VERIFIED | `rewriteParentModule()` in rewrite-parent.ts (309 lines) uses MagicString for surgical text replacement. Bare `$()` replaced with `q_symbolName`, named markers rewritten to `XQrl(q_symbolName)`. Nesting detection via call range containment sets parent field. 12 rewrite-parent tests pass including Test 9 (nested parent-child). |
| 3 | Call forms are rewritten correctly (`component$` to `componentQrl`, `useTask$` to `useTaskQrl`, `sync$` to `_qrlSync`, etc.) with `/*#__PURE__*/` annotations | VERIFIED | `getQrlCalleeName()` in rewrite-calls.ts handles all marker-to-Qrl transformations. `needsPureAnnotation()` returns true for componentQrl/qrl only. `buildSyncTransform()` produces `_qrlSync(fn, "minified")`. 13 rewrite-calls tests + parent rewrite tests 7 and 8 confirm. |
| 4 | Import paths are rewritten (`@builder.io/qwik` to `@qwik.dev/core`, etc.) and necessary imports are added to both parent and segment modules without duplication | VERIFIED | `rewriteImportSource()` in rewrite-imports.ts handles all 3 package rewrites with sub-path preservation. `rewriteParentModule()` adds optimizer imports as separate statements and deduplicates. `generateSegmentCode()` uses `rewriteImportSource()` for segment imports. 11 import rewrite tests + parent tests 4-6, 11 confirm. |
| 5 | `transformModule()` function accepts the same options interface as the NAPI binding and returns transformed code, segment array, and diagnostics | VERIFIED | `transformModule()` in transform.ts (168 lines) accepts `TransformModulesOptions` and returns `TransformOutput` with modules (parent + segments), diagnostics, isTypeScript, isJsx. Types in types.ts match NAPI interface (TransformModulesOptions, TransformOutput, TransformModule, SegmentAnalysis, EntryStrategy with 7 variants, etc.). 8 transform integration tests + 6 snapshot batch tests confirm. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/types.ts` | All API types | VERIFIED | 130 lines, 12 exported types/interfaces including TransformModulesOptions, TransformOutput, TransformModule, SegmentAnalysis, EntryStrategy, Diagnostic |
| `src/optimizer/rewrite-imports.ts` | Import path rewriting | VERIFIED | 43 lines, exports rewriteImportSource(). 11 tests pass. |
| `src/optimizer/context-stack.ts` | Context stack for naming | VERIFIED | 91 lines, exports ContextStack class with push/pop/getDisplayName/getSymbolName. 8 tests pass. |
| `src/optimizer/marker-detection.ts` | Marker function detection | VERIFIED | 214 lines, exports collectImports, collectCustomInlined, isMarkerCall, isBare$, isSyncMarker, getCtxKind, getCtxName. 11 tests pass. |
| `src/optimizer/extract.ts` | Core extraction engine | VERIFIED | 352 lines, exports extractSegments() and ExtractionResult. Uses oxc-parser, oxc-walker, ContextStack, marker-detection. 11 tests pass. |
| `src/optimizer/segment-codegen.ts` | Segment module code generation | VERIFIED | 68 lines, exports generateSegmentCode(). Uses rewriteImportSource. Tested via extract.test.ts. |
| `src/optimizer/rewrite-calls.ts` | Call form rewriting utilities | VERIFIED | 126 lines, exports getQrlCalleeName, buildQrlDeclaration, buildSyncTransform, needsPureAnnotation, getQrlImportSource. 13 tests pass. |
| `src/optimizer/rewrite-parent.ts` | Parent module rewriting | VERIFIED | 309 lines, exports rewriteParentModule(). Uses MagicString, rewrite-calls, rewrite-imports. 12 tests pass. |
| `src/optimizer/transform.ts` | Public API entry point | VERIFIED | 168 lines, exports transformModule(). Wires extractSegments, rewriteParentModule, generateSegmentCode. 8 tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| transform.ts | extract.ts | `import { extractSegments }` | WIRED | Line 12 |
| transform.ts | rewrite-parent.ts | `import { rewriteParentModule }` | WIRED | Line 13 |
| transform.ts | segment-codegen.ts | `import { generateSegmentCode }` | WIRED | Line 14 |
| transform.ts | types.ts | type imports | WIRED | Line 1-10 (TransformModulesOptions, TransformOutput, etc.) |
| extract.ts | marker-detection.ts | `import { isMarkerCall, collectImports, ... }` | WIRED | Lines 15-25 |
| extract.ts | context-stack.ts | `import { ContextStack }` | WIRED | Line 14 |
| rewrite-parent.ts | magic-string | `import MagicString` | WIRED | Line 19 |
| rewrite-parent.ts | rewrite-calls.ts | `import { buildQrlDeclaration, ... }` | WIRED | Lines 24-29 |
| rewrite-parent.ts | rewrite-imports.ts | `import { rewriteImportSource }` | WIRED | Line 23 |
| segment-codegen.ts | rewrite-imports.ts | `import { rewriteImportSource }` | WIRED | Line 10 |
| context-stack.ts | naming.ts | `import { buildDisplayName, buildSymbolName }` | WIRED | Line 9 |

### Data-Flow Trace (Level 4)

Not applicable -- this is a compiler/build-time library, not a UI rendering data-flow. Data flows through function calls (source string in, transformed code out) which are verified by integration tests and snapshot matching.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 2 optimizer tests pass | `npx vitest run tests/optimizer/` | 87 passed, 0 failed | PASS |
| Full test suite (Phase 1 + Phase 2) passes | `npx vitest run` | 153 passed, 0 failed | PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | Exit 0, no errors | PASS |
| Snapshot corpus: 2 full matches | snapshot-batch.test.ts | issue_117, special_jsx full match | PASS |
| Snapshot corpus: 4 parent-only matches | snapshot-batch.test.ts | example_2, example_4, example_5, synchronous_qrl | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXTRACT-01 | 02-02 | Detect marker function calls ($-suffixed) | SATISFIED | isMarkerCall() in marker-detection.ts, 11 tests |
| EXTRACT-02 | 02-03 | Extract closure argument as segment | SATISFIED | extractSegments() in extract.ts, bodyText extraction, 11 tests |
| EXTRACT-03 | 02-04 | Handle nested $() calls with parent-child | SATISFIED | Nesting detection in rewrite-parent.ts, parent field set, Test 9 |
| EXTRACT-04 | 02-03 | Generate segment module with deterministic name | SATISFIED | generateSegmentCode() + symbolName from ContextStack/hash |
| EXTRACT-05 | 02-04 | Rewrite parent replacing $() with qrl() refs | SATISFIED | rewriteParentModule() with MagicString, 12 tests |
| EXTRACT-06 | 02-04 | Handle custom inlined functions | SATISFIED | collectCustomInlined() + rewrite-parent Test 10 |
| EXTRACT-07 | 02-01, 02-03 | Emit segment metadata (origin, name, hash, etc.) | SATISFIED | SegmentAnalysis type + ExtractionResult populated in extract.ts |
| CALL-01 | 02-03 | Rewrite component$ to componentQrl | SATISFIED | getQrlCalleeName("component$") returns "componentQrl" |
| CALL-02 | 02-03 | Rewrite useTask$/useVisibleTask$/useComputed$ to *Qrl | SATISFIED | Generic $->Qrl suffix transformation in getQrlCalleeName() |
| CALL-03 | 02-03 | Rewrite server$ to serverQrl | SATISFIED | getQrlCalleeName("server$") returns "serverQrl" |
| CALL-04 | 02-03 | Handle sync$ to _qrlSync with serialized body | SATISFIED | buildSyncTransform() produces _qrlSync(fn, "minified") |
| CALL-05 | 02-03 | Add PURE annotations on QRL/componentQrl | SATISFIED | needsPureAnnotation() + buildQrlDeclaration includes PURE |
| IMP-01 | 02-01 | Rewrite @builder.io/qwik to @qwik.dev/core | SATISFIED | rewriteImportSource(), 11 tests |
| IMP-02 | 02-01 | Rewrite @builder.io/qwik-city to @qwik.dev/router | SATISFIED | rewriteImportSource(), tested |
| IMP-03 | 02-01 | Rewrite @builder.io/qwik-react to @qwik.dev/react | SATISFIED | rewriteImportSource(), tested |
| IMP-04 | 02-04 | Add necessary imports to parent (qrl, componentQrl, etc.) | SATISFIED | rewriteParentModule() adds optimizer imports, Tests 1,5 |
| IMP-05 | 02-03 | Add necessary imports to segment modules | SATISFIED | Segment import filtering in extract.ts, generateSegmentCode() |
| IMP-06 | 02-04 | Deduplicate imports | SATISFIED | rewriteParentModule() checks existing imports, Test 11 |
| API-01 | 02-05 | Export transformModule() matching NAPI binding | SATISFIED | transformModule() in transform.ts, 8 integration tests |
| API-02 | 02-05 | Return transformed code, segments, diagnostics | SATISFIED | TransformOutput with modules[], diagnostics[], isTypeScript, isJsx |
| API-03 | 02-01 | Accept options: filename, entryStrategy, mode, etc. | SATISFIED | TransformModulesOptions interface with all fields in types.ts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | No TODOs, FIXMEs, placeholders, or empty implementations in src/optimizer/ |

### Human Verification Required

None. All verification is automated through tests and snapshot matching.

### Gaps Summary

No gaps found. All 5 roadmap success criteria are verified. All 21 requirement IDs (EXTRACT-01 through EXTRACT-07, CALL-01 through CALL-05, IMP-01 through IMP-06, API-01 through API-03) are satisfied with implementation evidence and passing tests. The full test suite (153 tests) passes without regressions. Two snapshot corpus files fully match end-to-end, with 4 additional parent-module matches confirming the pipeline works correctly for Phase 2 scope.

---

_Verified: 2026-04-10T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
