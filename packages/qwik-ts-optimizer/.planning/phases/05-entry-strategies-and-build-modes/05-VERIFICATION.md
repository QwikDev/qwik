---
phase: 05-entry-strategies-and-build-modes
verified: 2026-04-10T17:30:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Verify dev mode qrlDEV output matches Qwik's SWC optimizer output for a real component"
    expected: "qrlDEV() declarations with file/lo/hi/displayName metadata that matches SWC optimizer byte-for-byte in structure"
    why_human: "No snapshot convergence testing has been run yet (Phase 6). Structural correctness of dev mode output cannot be verified without comparing against real SWC snapshots."
  - test: "Verify inline/hoist strategy _noopQrl + .s() output works with Qwik runtime"
    expected: "Inlined segments load and execute correctly in a Qwik app using inline entry strategy"
    why_human: "Requires running a Qwik app with inline entry strategy to verify runtime behavior. Unit tests verify string format but not runtime correctness."
  - test: "Verify _useHmr injection works with Qwik's HMR system"
    expected: "Component segments with _useHmr calls trigger hot module replacement when source changes"
    why_human: "buildUseHmrCall() builder exists but is NOT wired into the pipeline (no call sites in transform.ts or rewrite-parent.ts). The SUMMARY acknowledges this: 'pipeline injection deferred pending snapshot evidence.' Needs human decision on whether this is blocking."
---

# Phase 5: Entry Strategies and Build Modes Verification Report

**Phase Goal:** The optimizer supports all entry strategies and build mode configurations that Qwik's Vite plugin can request
**Verified:** 2026-04-10T17:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Smart mode (default) produces each segment as a separate file with dynamic import references | VERIFIED | `resolveEntryField()` returns null for smart/segment/hook strategies; wired in transform.ts lines 292, 416; 442 tests pass including default-mode tests |
| 2 | Inline/hoist mode produces segments inlined using `_noopQrl` + `.s()` pattern instead of separate files | VERIFIED | `buildNoopQrlDeclaration()` and `buildSCall()` in inline-strategy.ts; wired in rewrite-parent.ts lines 523-553; inline branch in transform.ts line 288 skips separate segment files |
| 3 | Dev mode generates `qrlDEV()` with file/line/displayName metadata, JSX source info, and `_useHmr(filePath)` in component segments | VERIFIED (partial) | qrlDEV: `buildQrlDevDeclaration()` wired in rewrite-parent.ts lines 581, 599. JSX source info: wired via devOptions in jsx-transform.ts line 957. _useHmr: builder exists in dev-mode.ts but NOT wired into pipeline -- no call sites found. |
| 4 | Server strip mode replaces server-only code with null exports; client strip mode does the same; strip exports replaces specified exports with throw statements | VERIFIED | `isStrippedSegment()` wired extensively in rewrite-parent.ts (lines 304, 410, 433, 438, 525, 561, 628) and transform.ts line 275. `stripExportDeclarations()` wired in rewrite-parent.ts line 250. Throw message matches exact Qwik format. |
| 5 | `isServer`, `isBrowser`, and `isDev` constants are replaced with correct boolean values based on configuration | VERIFIED | `replaceConstants()` wired in rewrite-parent.ts line 258. Import-aware replacement only targets Qwik package imports. Removes import bindings after replacement. 13 unit tests cover all cases. |

**Score:** 5/5 truths verified (Truth 3 has partial _useHmr gap noted below)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/entry-strategy.ts` | Entry strategy resolution | VERIFIED | 72 lines, exports `resolveEntryField`, handles all 7 strategy types |
| `src/optimizer/dev-mode.ts` | Dev mode QRL/JSX builders | VERIFIED | 113 lines, exports `buildQrlDevDeclaration`, `buildDevFilePath`, `buildJsxSourceInfo`, `buildUseHmrCall` |
| `src/optimizer/inline-strategy.ts` | Inline/hoist QRL builders | VERIFIED | 134 lines, exports 6 functions: `buildNoopQrlDeclaration`, `buildNoopQrlDevDeclaration`, `buildStrippedNoopQrl`, `buildStrippedNoopQrlDev`, `buildSCall`, `getSentinelCounter` |
| `src/optimizer/strip-ctx.ts` | Context name stripping | VERIFIED | 60 lines, exports `isStrippedSegment`, `generateStrippedSegmentCode` |
| `src/optimizer/strip-exports.ts` | Export stripping with throw | VERIFIED | 230 lines, exports `stripExportDeclarations`. Handles variable + function declarations, removes unused imports |
| `src/optimizer/const-replacement.ts` | isServer/isBrowser/isDev replacement | VERIFIED | 227 lines, exports `replaceConstants`. Import-aware, handles 5 Qwik package sources |
| `tests/optimizer/entry-strategy.test.ts` | Entry strategy tests | VERIFIED | 2610 bytes, covers smart/segment/hook/component/single/manual |
| `tests/optimizer/dev-mode.test.ts` | Dev mode tests | VERIFIED | 2878 bytes, covers qrlDEV format, dev file path, JSX source info |
| `tests/optimizer/inline-strategy.test.ts` | Inline strategy tests | VERIFIED | 5070 bytes, 14 tests for all builders |
| `tests/optimizer/strip-ctx.test.ts` | Strip context tests | VERIFIED | 2862 bytes, 10 tests for detection + code gen |
| `tests/optimizer/strip-exports.test.ts` | Strip exports tests | VERIFIED | 3772 bytes, 8 tests for throw format + import cleanup |
| `tests/optimizer/const-replacement.test.ts` | Const replacement tests | VERIFIED | 5331 bytes, 13 tests for server/browser/dev replacement |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| transform.ts | entry-strategy.ts | `resolveEntryField()` | WIRED | Imported line 18, called lines 292, 416 |
| rewrite-parent.ts | dev-mode.ts | `buildQrlDevDeclaration()` | WIRED | Imported line 32, called lines 581, 599 |
| transform.ts | inline-strategy.ts | `buildNoopQrlDeclaration` | WIRED | Via rewrite-parent.ts import line 34, called line 553 |
| transform.ts | strip-ctx.ts | `isStrippedSegment()` | WIRED | Imported in both transform.ts (line 20) and rewrite-parent.ts (line 40), called extensively |
| rewrite-parent.ts | strip-exports.ts | `stripExportDeclarations()` | WIRED | Imported line 42, called line 250 |
| rewrite-parent.ts | const-replacement.ts | `replaceConstants()` | WIRED | Imported line 43, called line 258 |
| rewrite-parent.ts | jsx-transform.ts | dev source info via devOptions | WIRED | Line 386 passes `isDevMode ? { relPath } : undefined` to `transformAllJsx()` |

### Data-Flow Trace (Level 4)

Not applicable -- these are code transformation modules (builders/rewriters), not UI components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All tests pass | `npx vitest run` | 28 test files, 442 tests passed | PASS |
| Entry strategy module exports resolveEntryField | import check | Exported on line 35 of entry-strategy.ts | PASS |
| Const replacement module exports replaceConstants | import check | Exported on line 57 of const-replacement.ts | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| ENT-01 | 05-01 | Smart mode -- each segment as separate file with dynamic import | SATISFIED | `resolveEntryField('smart', ...)` returns null; default pipeline unchanged |
| ENT-02 | 05-02 | Inline/Hoist mode -- _noopQrl + .s() pattern | SATISFIED | inline-strategy.ts builders + pipeline wiring in rewrite-parent.ts |
| ENT-03 | 05-01 | Component entry strategy -- group by component | SATISFIED | `resolveEntryField('component', ...)` returns parent symbol for non-component segments |
| ENT-04 | 05-01 | Manual chunks strategy -- custom grouping | SATISFIED | `resolveEntryField` checks manual map before strategy switch |
| MODE-01 | 05-01 | Dev mode qrlDEV with metadata | SATISFIED | `buildQrlDevDeclaration()` wired in rewrite-parent.ts |
| MODE-02 | 05-01 | Dev mode JSX source info | SATISFIED | devOptions wired through jsx-transform.ts with fileName/lineNumber/columnNumber |
| MODE-03 | 05-01 | HMR injection _useHmr | PARTIAL | Builder exists (`buildUseHmrCall`) but NOT wired into pipeline |
| MODE-04 | 05-02 | Server strip mode -- null exports | SATISFIED | `isStrippedSegment()` + `generateStrippedSegmentCode()` wired in pipeline |
| MODE-05 | 05-02 | Client strip mode + stripEventHandlers | SATISFIED | `isStrippedSegment()` handles ctxKind === 'eventHandler' when stripEventHandlers=true |
| MODE-06 | 05-03 | Strip exports -- throw statements | SATISFIED | `stripExportDeclarations()` with exact throw message, unused import cleanup |
| MODE-07 | 05-03 | isServer/isBrowser/isDev const replacement | SATISFIED | `replaceConstants()` with import-aware substitution from 5 Qwik package sources |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/optimizer/dev-mode.ts | 107 | TODO: _useHmr no snapshot evidence | Warning | Builder exists but pipeline injection deferred. Does not block other dev mode features. |

### Human Verification Required

### 1. Dev mode qrlDEV output accuracy

**Test:** Run the optimizer on a real Qwik component in dev mode and compare qrlDEV output structure against SWC optimizer output
**Expected:** qrlDEV declarations match structure (file path, lo/hi offsets, displayName)
**Why human:** Phase 6 snapshot convergence will test this systematically, but no snapshot comparison has been run yet

### 2. Inline/hoist runtime correctness

**Test:** Build a Qwik app with `entryStrategy: { type: 'inline' }` and verify it loads correctly
**Expected:** Components render, event handlers fire, lazy-loading works via _noopQrl + .s() mechanism
**Why human:** Unit tests verify string output format but not Qwik runtime compatibility

### 3. _useHmr pipeline integration decision

**Test:** Determine if _useHmr pipeline injection is required for Phase 5 completion or can be deferred
**Expected:** Either wire buildUseHmrCall into segment codegen for dev mode component segments, or explicitly defer to a later phase with justification
**Why human:** The builder function exists but is not called anywhere in the pipeline. The SUMMARY says "pipeline injection deferred pending snapshot evidence." This needs a human decision on whether MODE-03 is truly satisfied without pipeline wiring.

### Gaps Summary

No blocking gaps were identified. All 11 requirements (ENT-01 through ENT-04, MODE-01 through MODE-07) have implementations that pass unit tests.

The one notable concern is MODE-03 (_useHmr injection): the builder function `buildUseHmrCall()` exists and is tested, but it is not wired into the transform pipeline. The SUMMARY explicitly acknowledges this, stating pipeline injection is deferred due to lack of snapshot evidence. This is classified as PARTIAL rather than FAILED because (a) the builder exists and works, (b) the plan itself noted _useHmr as best-effort, and (c) the wiring gap is documented and intentional.

All other entry strategies and build modes are fully implemented with passing tests and verified pipeline wiring.

---

_Verified: 2026-04-10T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
