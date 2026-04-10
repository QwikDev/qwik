---
phase: 04-jsx-signals-and-event-handlers
plan: 02
subsystem: optimizer
tags: [signals, wrapProp, fnSignal, jsx, reactivity]

requires:
  - phase: 04-01
    provides: JSX element transformation with prop classification

provides:
  - Signal expression analysis (analyzeSignalExpression)
  - _wrapProp generation for signal.value and store.field patterns
  - _fnSignal generation with hoisted functions for computed expressions
  - SignalHoister class for module-scope function hoisting

affects: [04-03, 04-04, 04-05]

tech-stack:
  added: []
  patterns:
    - "Reactive root detection via member chain walking"
    - "Minimal whitespace string representation for hoisted function strings"
    - "Source text preservation in hoisted function bodies"

key-files:
  created:
    - src/optimizer/signal-analysis.ts
    - tests/optimizer/signal-analysis.test.ts
  modified: []

key-decisions:
  - "Deep store access (depth >= 2 member chain) produces _fnSignal, not _wrapProp"
  - "Single-level store/props field access produces _wrapProp(obj, field)"
  - "hoistedFn preserves source whitespace; hoistedStr removes it"
  - "Quote normalization (single->double in string rep) deferred to integration testing"

patterns-established:
  - "collectReactiveRoots: walk AST to find signal.value and deep store patterns"
  - "generateFnSignal: replace root names with pN parameters, generate fn + str"
  - "removeWhitespace: strip spaces while preserving string literal content"

requirements-completed: [SIG-01, SIG-02, SIG-03, SIG-04, SIG-05]

duration: 5min
completed: 2026-04-10
---

# Phase 04 Plan 02: Signal Analysis Summary

**Signal detection module with _wrapProp for signal.value/store.field and _fnSignal with hoisted pN-parameterized functions for computed expressions**

## What Was Built

### signal-analysis.ts
Core module for analyzing JSX prop expressions and determining appropriate signal wrapping:

1. **analyzeSignalExpression()** - Main entry point that classifies expressions:
   - `signal.value` -> `{ type: 'wrapProp', code: '_wrapProp(signal)' }`
   - `props.class` -> `{ type: 'wrapProp', code: '_wrapProp(props, "class")' }`
   - `props['data-nu']` -> `{ type: 'wrapProp', code: '_wrapProp(props, "data-nu")' }`
   - `store.address.city.name` -> `{ type: 'fnSignal', deps: ['store'], ... }`
   - `12 + signal.value` -> `{ type: 'fnSignal', deps: ['signal'], ... }`
   - `signal.value()`, `mutable(x)`, mixed with imports -> `{ type: 'none' }`

2. **isSignalValueAccess()** - Detects `x.value` MemberExpression pattern
3. **isStoreFieldAccess()** - Detects single-level `obj.field` on local (non-imported) objects
4. **SignalHoister** - Manages _hf0, _hf1 naming and declaration generation

### Non-wrap conditions (SIG-05)
Correctly returns `{ type: 'none' }` for:
- `signal.value()` (function call on .value)
- `signal.value + unknown()` (mixed with unknown call)
- `mutable(signal)` (explicit mutable wrapper)
- `signal.value + dep` (mixed with imported reference)
- String/number/boolean literals
- Bare identifiers (no .value access)
- Imported names

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 RED | 4c5d891 | Failing tests for _wrapProp detection |
| 1 GREEN | 5f786da | Implement signal analysis with _wrapProp |
| 2 RED | 76796a9 | Failing tests for _fnSignal and SignalHoister |
| 2 GREEN | 8aa651d | Implement _fnSignal generation with hoisted functions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] oxc-parser uses Literal not StringLiteral for computed property access**
- **Found during:** Task 1
- **Issue:** `props['data-nu']` parsed with `property.type === 'Literal'` not `'StringLiteral'`
- **Fix:** Added `|| node.property.type === 'Literal'` check in getPropertyName
- **Files modified:** src/optimizer/signal-analysis.ts
- **Commit:** 5f786da

**2. [Rule 1 - Bug] oxc-parser parseSync API uses positional args (filename, source)**
- **Found during:** Task 1
- **Issue:** Tests used `parseSync(source, { sourceFilename })` instead of `parseSync(filename, source)`
- **Fix:** Updated parseExpr helper to match project's existing pattern
- **Files modified:** tests/optimizer/signal-analysis.test.ts
- **Commit:** 5f786da

## Test Coverage

- 25 unit tests covering all signal analysis paths
- 264 total tests passing (no regressions)
- Tests cover: wrapProp, fnSignal, non-wrap conditions, helpers, SignalHoister

## Self-Check: PASSED
