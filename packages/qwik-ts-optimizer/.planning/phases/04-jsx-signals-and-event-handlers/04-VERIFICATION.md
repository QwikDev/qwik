---
phase: 04-jsx-signals-and-event-handlers
verified: 2026-04-10T16:25:00Z
status: gaps_found
score: 1/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Signal expressions in JSX props are wrapped with _wrapProp or generate _fnSignal with hoisted _hf module-scope functions"
    status: failed
    reason: "signal-analysis.ts module exists with correct unit tests (25 passing), but analyzeSignalExpression() and SignalHoister are imported-but-never-called in transform.ts or jsx-transform.ts. The JSX output does NOT contain _wrapProp or _fnSignal calls."
    artifacts:
      - path: "src/optimizer/signal-analysis.ts"
        issue: "Module is substantive (621 lines, all exports present) but ORPHANED -- never invoked in the transform pipeline"
      - path: "src/optimizer/transform.ts"
        issue: "Imports analyzeSignalExpression and SignalHoister at line 35 but never calls them"
    missing:
      - "Call analyzeSignalExpression() on each JSX prop expression within the JSX transform prop-processing loop in jsx-transform.ts or rewrite-parent.ts"
      - "Use SignalHoister to generate _hf module-scope declarations and insert them into parent output"

  - truth: "Event handlers (onClick$, document:onFocus$, window:onClick$) are transformed to q-e:click, q-d:focus, q-w:click naming in constProps"
    status: failed
    reason: "event-handler-transform.ts module exists with correct unit tests (38 passing) and exact Rust algorithm match, but transformEventPropName() is imported-but-never-called in the JSX prop processing pipeline. Event handlers ARE extracted as segments but prop names are NOT renamed in the JSX output."
    artifacts:
      - path: "src/optimizer/event-handler-transform.ts"
        issue: "Module is substantive (237 lines, all exports present) but ORPHANED -- never invoked during JSX prop assembly"
      - path: "src/optimizer/transform.ts"
        issue: "Imports transformEventPropName, isEventProp, collectPassiveDirectives at line 36 but never calls them"
    missing:
      - "Call transformEventPropName() during JSX element prop processing to rename onClick$ -> q-e:click in the output constProps"
      - "Apply passive event prefix mapping (q-ep:/q-wp:/q-dp:) when passive directives are present"

  - truth: "Event handlers inside loops have .w([captures]) hoisted above the loop with q:p/q:ps injection and positional parameter padding"
    status: failed
    reason: "loop-hoisting.ts module exists with correct unit tests (31 passing), but detectLoopContext(), findEnclosingLoop(), and analyzeLoopHandler() are imported-but-never-called in transform.ts. No loop context detection or .w() hoisting occurs in actual transform output."
    artifacts:
      - path: "src/optimizer/loop-hoisting.ts"
        issue: "Module is substantive (359 lines, all exports present) but ORPHANED -- never invoked in the transform pipeline"
      - path: "src/optimizer/transform.ts"
        issue: "Imports detectLoopContext, findEnclosingLoop, analyzeLoopHandler at line 38 but never calls them"
    missing:
      - "Call findEnclosingLoop() / detectLoopContext() during event handler processing to detect loop context"
      - "Apply hoistEventCaptures() to generate .w() declarations and insert them before loops"
      - "Call buildQpProp() to inject q:p/q:ps into JSX element constProps for handlers in loops"

  - truth: "bind:value and bind:checked produce value prop + q-e:input handler with inlinedQrl"
    status: failed
    reason: "bind-transform.ts module exists with correct unit tests (15 passing), but transformBindProp() and isBindProp() are imported-but-never-called in the JSX prop processing pipeline. bind: syntax is NOT desugared in actual transform output."
    artifacts:
      - path: "src/optimizer/bind-transform.ts"
        issue: "Module is substantive (136 lines, all exports present) but ORPHANED -- never invoked during JSX prop assembly"
      - path: "src/optimizer/transform.ts"
        issue: "Imports transformBindProp, isBindProp at line 37 but never calls them"
    missing:
      - "Call isBindProp() and transformBindProp() during JSX attribute processing to desugar bind:value/bind:checked"
      - "Insert inlinedQrl handler and value prop into the JSX element output"
---

# Phase 4: JSX, Signals, and Event Handlers Verification Report

**Phase Goal:** JSX elements are transformed to optimized _jsxSorted calls with signal-aware prop classification, event handler extraction, and loop-context hoisting
**Verified:** 2026-04-10T16:25:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JSX elements produce _jsxSorted calls with correct prop classification and deterministic keys | VERIFIED | _jsxSorted calls generated, classifyProp works, JsxKeyCounter produces u6_N, flags bitmask correct. 47 unit tests + 7 integration tests pass. |
| 2 | Signal expressions in JSX props are wrapped with _wrapProp or _fnSignal | FAILED | signal-analysis.ts exists (621 lines, 25 tests) but analyzeSignalExpression() is never called in the transform pipeline. Import at transform.ts:35 is unused. |
| 3 | Event handlers transformed to q-e:click, q-d:focus, q-w:click in constProps | FAILED | event-handler-transform.ts exists (237 lines, 38 tests) but transformEventPropName() is never called. Import at transform.ts:36 is unused. Event handlers ARE extracted as segments but prop names are NOT renamed. |
| 4 | Event handlers inside loops have .w() hoisted with q:p/q:ps injection | FAILED | loop-hoisting.ts exists (359 lines, 31 tests) but detectLoopContext()/analyzeLoopHandler() are never called. Import at transform.ts:38 is unused. |
| 5 | bind:value/bind:checked produce value prop + q-e:input handler with inlinedQrl | FAILED | bind-transform.ts exists (136 lines, 15 tests) but transformBindProp() is never called. Import at transform.ts:37 is unused. |

**Score:** 1/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/optimizer/jsx-transform.ts` | JSX element transformation | VERIFIED | 853 lines, exports classifyProp, computeFlags, JsxKeyCounter, transformAllJsx, isHtmlElement, processJsxTag. Called by rewrite-parent.ts and segment-codegen.ts. |
| `src/optimizer/signal-analysis.ts` | Signal detection and wrapping | ORPHANED | 621 lines, exports analyzeSignalExpression, SignalHoister. Imported by transform.ts but never called. |
| `src/optimizer/event-handler-transform.ts` | Event prop naming | ORPHANED | 237 lines, exports transformEventPropName, isEventProp, isPassiveDirective. Imported by transform.ts but never called. |
| `src/optimizer/bind-transform.ts` | bind: desugaring | ORPHANED | 136 lines, exports transformBindProp, isBindProp, mergeEventHandlers. Imported by transform.ts but never called. |
| `src/optimizer/loop-hoisting.ts` | Loop detection and hoisting | ORPHANED | 359 lines, exports detectLoopContext, hoistEventCaptures, findEnclosingLoop, generateParamPadding, buildQpProp, analyzeLoopHandler. Imported by transform.ts but never called. |
| `src/optimizer/types.ts` | ctxKind with jSXProp | VERIFIED | ctxKind union includes 'jSXProp' at line 74. |
| `tests/optimizer/jsx-transform.test.ts` | JSX unit tests | VERIFIED | 594 lines, 47 tests passing. |
| `tests/optimizer/signal-analysis.test.ts` | Signal unit tests | VERIFIED | 238 lines, 25 tests passing. |
| `tests/optimizer/event-handler-transform.test.ts` | Event handler tests | VERIFIED | 221 lines, 38 tests passing. |
| `tests/optimizer/bind-transform.test.ts` | Bind syntax tests | VERIFIED | 133 lines, 15 tests passing. |
| `tests/optimizer/loop-hoisting.test.ts` | Loop hoisting tests | VERIFIED | 457 lines, 31 tests passing. |
| `tests/optimizer/transform.test.ts` | Integration tests | VERIFIED | 7 new JSX integration tests added. |
| `tests/optimizer/snapshot-batch.test.ts` | Snapshot validation | VERIFIED | 12 JSX snapshots added (metadata-only validation). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| jsx-transform.ts | magic-string | MagicString s.overwrite | WIRED | Used extensively for JSX node replacement |
| jsx-transform.ts | rewrite-parent.ts | transformAllJsx called | WIRED | Called at rewrite-parent.ts:307 |
| jsx-transform.ts | segment-codegen.ts | transformAllJsx called | WIRED | Called at segment-codegen.ts:278 |
| signal-analysis.ts | transform.ts | analyzeSignalExpression | NOT_WIRED | Imported at line 35 but never called |
| event-handler-transform.ts | transform.ts | transformEventPropName | NOT_WIRED | Imported at line 36 but never called |
| bind-transform.ts | transform.ts | transformBindProp | NOT_WIRED | Imported at line 37 but never called |
| loop-hoisting.ts | transform.ts | detectLoopContext | NOT_WIRED | Imported at line 38 but never called |

### Data-Flow Trace (Level 4)

Not applicable -- these are build-time transform modules, not rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite passes | pnpm vitest run | 367 passed (22 files) | PASS |
| JSX _jsxSorted in output | Integration test "transforms basic JSX element" | _jsxSorted present in parent output | PASS |
| Signal wrapping in output | grep analyzeSignalExpression call sites | 0 call sites in pipeline | FAIL |
| Event naming in output | grep transformEventPropName call sites | 0 call sites in pipeline | FAIL |
| Bind desugaring in output | grep transformBindProp call sites | 0 call sites in pipeline | FAIL |
| Loop hoisting in output | grep detectLoopContext call sites | 0 call sites in pipeline | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| JSX-01 | 04-01 | _jsxSorted calls | SATISFIED | transformAllJsx generates _jsxSorted, integration test confirms |
| JSX-02 | 04-01 | varProps/constProps classification | SATISFIED | classifyProp correctly classifies, integration test confirms |
| JSX-03 | 04-01 | Flags bitmask | SATISFIED | computeFlags returns correct values (0,1,2,3,4,6) |
| JSX-04 | 04-01 | Deterministic u6_N keys | SATISFIED | JsxKeyCounter generates sequential keys |
| JSX-05 | 04-01 | _jsxSplit for spreads | SATISFIED | transformJsxElement handles spreads, unit tests pass |
| JSX-06 | 04-01 | Fragment transform | SATISFIED | _Fragment support, integration test confirms |
| SIG-01 | 04-02 | _wrapProp for signal.value | BLOCKED | Module works in isolation but not wired into pipeline |
| SIG-02 | 04-02 | _wrapProp for store.field | BLOCKED | Module works in isolation but not wired into pipeline |
| SIG-03 | 04-02 | _fnSignal for computed expressions | BLOCKED | Module works in isolation but not wired into pipeline |
| SIG-04 | 04-02 | Hoisted _hf functions | BLOCKED | SignalHoister works in isolation but not wired into pipeline |
| SIG-05 | 04-02 | Non-wrap conditions | SATISFIED | analyzeSignalExpression correctly returns none for non-wrap cases (unit tested) |
| EVT-01 | 04-03 | onClick$ -> q-e:click | BLOCKED | Module works in isolation but not wired into JSX output |
| EVT-02 | 04-03 | document:onFocus$ -> q-d:focus | BLOCKED | Module works in isolation but not wired into JSX output |
| EVT-03 | 04-03 | window:onClick$ -> q-w:click | BLOCKED | Module works in isolation but not wired into JSX output |
| EVT-04 | 04-03 | Custom event kebab-case | BLOCKED | Module works in isolation but not wired into JSX output |
| EVT-05 | 04-03 | Passive events | BLOCKED | Module works in isolation but not wired into JSX output |
| EVT-06 | 04-03 | Event handler segment extraction | SATISFIED | Extraction pipeline handles $-suffixed JSX attrs as segments |
| BIND-01 | 04-03 | bind:value desugaring | BLOCKED | Module works in isolation but not wired into JSX output |
| BIND-02 | 04-03 | bind:checked desugaring | BLOCKED | Module works in isolation but not wired into JSX output |
| BIND-03 | 04-03 | Unknown bind passthrough | BLOCKED | Module works in isolation but not wired into JSX output |
| LOOP-01 | 04-04 | .w() hoisting above loops | BLOCKED | Module works in isolation but not wired into pipeline |
| LOOP-02 | 04-04 | q:p injection | BLOCKED | Module works in isolation but not wired into pipeline |
| LOOP-03 | 04-04 | q:ps injection | BLOCKED | Module works in isolation but not wired into pipeline |
| LOOP-04 | 04-04 | Positional parameter padding | BLOCKED | Module works in isolation but not wired into pipeline |
| LOOP-05 | 04-04 | All loop types detected | SATISFIED | detectLoopContext handles all 6 types (unit tested) |

**Summary:** 10/25 requirements satisfied, 15/25 blocked (modules exist but not wired into pipeline)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/optimizer/signal-analysis.ts | 590 | Stale comment "placeholder for Task 2" but class is fully implemented | Info | Misleading comment only |
| src/optimizer/transform.ts | 35-38 | Four unused imports (signal-analysis, event-handler-transform, bind-transform, loop-hoisting) | Blocker | Modules imported but never called -- the core integration gap |

### Human Verification Required

None identified. All gaps are programmatically verifiable.

### Gaps Summary

The Phase 4 implementation has a fundamental integration gap. Five independent modules were built and thoroughly unit-tested:

1. **jsx-transform.ts** (853 lines, 47 tests) -- WIRED and working
2. **signal-analysis.ts** (621 lines, 25 tests) -- built but ORPHANED
3. **event-handler-transform.ts** (237 lines, 38 tests) -- built but ORPHANED
4. **bind-transform.ts** (136 lines, 15 tests) -- built but ORPHANED
5. **loop-hoisting.ts** (359 lines, 31 tests) -- built but ORPHANED

The integration plan (04-05) wired jsx-transform.ts into the pipeline but explicitly documented that signal-analysis, event-handler-transform, bind-transform, and loop-hoisting are "imported but not yet integrated into the JSX prop processing pipeline." These four modules are imported at transform.ts lines 35-38 but their functions are never called anywhere in the pipeline.

**Root cause:** Plan 04-05 Task 1 was supposed to wire all modules into the prop-processing loop inside transformAllJsx, but the implementation only achieved the JSX structural transform (element -> _jsxSorted) without integrating per-prop signal analysis, event naming, bind desugaring, or loop context.

**Impact:** The optimizer produces _jsxSorted calls but:
- signal.value goes to varProps without _wrapProp wrapping
- onClick$ stays as onClick$ instead of becoming q-e:click
- bind:value is not desugared
- Event handlers in loops are not hoisted

This means 4 of 5 roadmap success criteria are not met, and 15 of 25 requirement IDs are blocked.

---

_Verified: 2026-04-10T16:25:00Z_
_Verifier: Claude (gsd-verifier)_
