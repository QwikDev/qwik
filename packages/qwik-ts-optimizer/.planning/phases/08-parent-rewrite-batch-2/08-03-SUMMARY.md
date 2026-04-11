---
phase: 08-parent-rewrite-batch-2
plan: 03
subsystem: optimizer
tags: [signal-analysis, jsx-children, rawProps, destructuring, fnSignal, wrapProp]

requires:
  - phase: 08-parent-rewrite-batch-2
    plan: 01
    provides: "TS stripping and capture suppression"
provides:
  - "Signal analysis for JSX children expressions (_wrapProp/_fnSignal in children position)"
  - "_rawProps destructuring optimization for component$ params"
  - "collectAllDeps for compound expression dependency collection"
  - "Store field vs signal distinction in wrapProp classification"
affects: [08-parent-rewrite-batch-2]

tech-stack:
  added: []
  patterns:
    - "Children signal analysis: processOneChild delegates to analyzeSignalExpression for expression containers"
    - "_rawProps transform: parse body, detect ObjectPattern params, rewrite destructured fields to _rawProps.field"
    - "collectAllDeps partitions reactive roots (first) and bare identifiers (second) for correct pN parameter ordering"
    - "isStoreField flag on SignalExprResult wrapProp distinguishes store.field from signal.value for prop classification"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/signal-analysis.ts
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/signal-analysis.test.ts

key-decisions:
  - "_rawProps applied to ALL extractions with ObjectPattern first param, not just component$ -- the function validates destructuring pattern presence"
  - "collectAllDeps separates reactive roots (signal.value, store accesses) from bare identifiers, with reactive roots ordered first to match Rust optimizer pN parameter assignment"
  - "Store-field _wrapProp (2-arg form) goes to varEntries; signal _wrapProp (1-arg) stays in constEntries -- matching Rust optimizer prop classification"
  - "ObjectExpression added to compound expression signal analysis types for reactive detection in {field: store.field} patterns"

patterns-established:
  - "Children signal analysis: same analyzeSignalExpression dispatch for children as for props"
  - "_rawProps transform: text-based parse-and-replace pattern using oxc-parser on body text"
  - "Two-phase dep collection: collectReactiveRoots for trigger detection, collectAllDeps for full dep list including bare identifiers"

requirements-completed: [SC-1, SC-2, SC-3]

duration: 16min
completed: 2026-04-11
---

# Phase 08 Plan 03: Signal Wrapping for Children and _rawProps Destructuring Summary

**Extended signal analysis to JSX children position and implemented _rawProps destructuring optimization with compound expression dependency collection, maintaining zero regressions at 29 convergence tests**

## Changes Made

### Task 1: Extend signal analysis to JSX children position

Extended `processOneChild` and `processChildren` in jsx-transform.ts to accept `importedNames`, `signalHoister`, and `neededImports` parameters. For `JSXExpressionContainer` children, `analyzeSignalExpression()` is now called on the expression node:
- If result is `wrapProp`, the child text becomes the `_wrapProp(...)` call (classified as static)
- If result is `fnSignal`, a hoisted function is registered with the shared `SignalHoister` and the child text becomes `_fnSignal(hfN, [deps], hfN_str)`
- Both fragment and element processChildren calls pass through the new parameters

**Commit:** ee51946

### Task 2: Implement _rawProps destructuring optimization

Added `applyRawPropsTransform()` in rewrite-parent.ts that detects arrow function destructured params (`({field1, field2})`) and rewrites them to `(_rawProps)`, replacing all bare field references in the body with `_rawProps.field`. The transform uses a two-pass approach:
1. Parse body text, find ObjectPattern first param, collect field names
2. Re-parse after param replacement, walk AST to find and replace Identifier nodes (skipping property keys and member expression property names)

Extended signal analysis infrastructure:
- `collectAllDeps()` partitions dependencies into reactive roots (signal.value, store.field) and bare local identifiers, with reactive roots ordered first for correct pN parameter assignment matching Rust optimizer behavior
- `generateFnSignal` updated to handle bare identifier and store field replacements
- `isStoreField` flag on `SignalExprResult` wrapProp variant distinguishes store field access from signal value access for correct var/const prop classification
- `ObjectExpression` and `TemplateLiteral` added to compound expression signal analysis types

**Commit:** 5987f3e

## Verification

- Convergence tests: 29 passing (maintained, zero regressions)
- Unit tests: 473 passing (zero regressions, 2 tests updated for isStoreField field)
- The targeted convergence tests (example_props_wrapping, example_props_wrapping_children) show major improvement: _rawProps transform applied, _fnSignal/_wrapProp generated correctly in both props and children positions
- Full convergence pass blocked by a separate prop classification issue (const vs let/var declaration distinction for classifyProp) which is a pre-existing limitation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ctxName check for component extractions**
- **Found during:** Task 2
- **Issue:** Plan assumed `ext.ctxName === 'component'` but actual value is `'component$'` (includes $ suffix)
- **Fix:** Applied _rawProps transform to all extractions (the function validates ObjectPattern presence), not gated on ctxName
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** 5987f3e

**2. [Rule 2 - Missing] Added collectAllDeps for compound expression bare identifier tracking**
- **Found during:** Task 2
- **Issue:** Hoisted functions (_hf) did not include bare local identifiers (like `fromLocal`) as deps alongside reactive roots -- Rust optimizer includes all local variable references in _fnSignal deps
- **Fix:** Created `collectAllDeps()` that collects both reactive roots and bare identifiers, with proper ordering (reactive first, bare second)
- **Files modified:** src/optimizer/signal-analysis.ts
- **Commit:** 5987f3e

**3. [Rule 2 - Missing] Added store field replacement in generateFnSignal**
- **Found during:** Task 2
- **Issue:** `generateFnSignal` only replaced root identifiers for signal.value and deep store access, not for single-level store field access or bare identifiers
- **Fix:** Extended `findRootReplacements` to handle isStoreFieldAccess and bare Identifier nodes with parent context tracking
- **Files modified:** src/optimizer/signal-analysis.ts
- **Commit:** 5987f3e

## Known Stubs

None -- all functionality is wired and producing output.

## Deferred Issues

The prop classification (var vs const bucket) for _fnSignal and _wrapProp results does not fully match the Rust optimizer when `_rawProps` is used. The Rust optimizer appears to use declaration-kind (const vs let/param) to determine classification, which the current classifyProp does not track. This affects convergence for: example_props_wrapping, example_props_wrapping_children, example_props_wrapping2, example_props_wrapping_children2. This is documented as a deferred item for a future plan.

## Self-Check: PASSED
