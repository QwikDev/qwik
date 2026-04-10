---
phase: 04-jsx-signals-and-event-handlers
plan: 01
subsystem: optimizer
tags: [jsx, magic-string, oxc-walker, ast-transform, _jsxSorted, _jsxSplit]

# Dependency graph
requires:
  - phase: 02-core-extraction-pipeline
    provides: extraction engine, magic-string codegen pattern, marker detection
  - phase: 03-capture-analysis-and-variable-migration
    provides: scope analysis via oxc-walker
provides:
  - classifyProp function for varProps/constProps classification
  - computeFlags function for JSX element flags bitmask
  - JsxKeyCounter for deterministic u6_N key generation
  - transformJsxElement for JSX -> _jsxSorted/_jsxSplit conversion
  - transformJsxFragment for fragment -> _jsxSorted(_Fragment, ...) conversion
  - transformAllJsx for bottom-up AST walk transforming all JSX nodes
  - isHtmlElement for HTML vs component tag distinction
  - processJsxTag for tag name extraction
affects: [04-02-signal-analysis, 04-03-event-handler-transform, 04-04-bind-transform, 04-05-loop-hoisting]

# Tech tracking
tech-stack:
  added: []
  patterns: [prop-classification-const-var, flags-bitmask-computation, bottom-up-jsx-transform]

key-files:
  created:
    - src/optimizer/jsx-transform.ts
    - tests/optimizer/jsx-transform.test.ts
  modified: []

key-decisions:
  - "Flags bitmask: bit0=immutable props, bit1=static children, bit2=loop context (verified against snapshot corpus)"
  - "All JSX transform functions built in single module for Task 1 since spread/fragment/tag logic is tightly coupled with base element transform"

patterns-established:
  - "Prop classification: classifyProp recursively analyzes expression AST to determine const vs var"
  - "JSX transform returns result object with callString, enabling caller to decide placement"
  - "Bottom-up walk via oxc-walker leave callback ensures inner JSX transformed before outer"

requirements-completed: [JSX-01, JSX-02, JSX-03, JSX-04, JSX-05, JSX-06]

# Metrics
duration: 5min
completed: 2026-04-10
---

# Phase 04 Plan 01: JSX Element Transform Summary

**JSX element transformation to _jsxSorted/_jsxSplit calls with prop classification, flags bitmask, key generation, spread handling, and fragment support**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-10T20:40:24Z
- **Completed:** 2026-04-10T20:46:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built complete JSX transform module with classifyProp analyzing expression AST for const/var classification
- Flags bitmask computation matching snapshot corpus (bit0=immutable props, bit1=static children, bit2=loop)
- _jsxSplit generation for spread props with _getVarProps/_getConstProps pattern
- Fragment support via _jsxSorted(_Fragment, ...) with _Fragment tracked for import
- 47 new unit tests all passing, no regressions (239 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create jsx-transform.ts with prop classification and _jsxSorted generation**
   - `2435a3d` (test: failing tests for JSX transform)
   - `e2aeabd` (feat: implement JSX transform with prop classification, flags, and key generation)
2. **Task 2: Add _jsxSplit for spreads, fragment handling, component vs element distinction**
   - `e49cf7c` (feat: add spread/fragment/key/tag tests and fix ESM import)

_Note: TDD tasks have test commit then implementation commit_

## Files Created/Modified
- `src/optimizer/jsx-transform.ts` - JSX element transformation: classifyProp, computeFlags, JsxKeyCounter, transformJsxElement, transformJsxFragment, transformAllJsx, isHtmlElement, processJsxTag
- `tests/optimizer/jsx-transform.test.ts` - 47 unit tests covering prop classification, flags computation, key generation, element/component tags, spread props, fragments, and integration

## Decisions Made
- Flags bitmask interpretation: bit 0 (value 1) = no varProps (immutable props), bit 1 (value 2) = static/no children, bit 2 (value 4) = loop context. Verified against snapshot corpus values 0, 1, 2, 3, 4, 6.
- Built all JSX transform functionality (including spread, fragment, tag processing) in Task 1 implementation since the functions are tightly coupled. Task 2 added tests verifying these features.
- Used `type` import for MagicString and regular import for oxc-walker to maintain ESM compatibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed operator precedence in propName extraction**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `??` nullish coalescing had lower precedence than `===` ternary, causing namespace check to evaluate incorrectly and crash on `attr.name.namespace.name`
- **Fix:** Replaced chained ternary with explicit if/else block for JSXNamespacedName detection
- **Files modified:** src/optimizer/jsx-transform.ts
- **Verification:** All 31 tests pass
- **Committed in:** e2aeabd (Task 1 implementation commit)

**2. [Rule 1 - Bug] Fixed flags bitmask bit assignment**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Bit 0 and bit 1 were swapped (bit 0 was children, bit 1 was props) but snapshots show bit 0 = immutable props, bit 1 = static children
- **Fix:** Swapped the flag assignments to match snapshot-observed values
- **Files modified:** src/optimizer/jsx-transform.ts
- **Verification:** computeFlags tests pass with correct values (3, 1, 2, 0)
- **Committed in:** e2aeabd (Task 1 implementation commit)

**3. [Rule 1 - Bug] Fixed require() to ESM import for oxc-walker**
- **Found during:** Task 2
- **Issue:** transformAllJsx used `require('oxc-walker')` which is not valid in ESM modules
- **Fix:** Added top-level `import { walk } from 'oxc-walker'` and removed the require call
- **Files modified:** src/optimizer/jsx-transform.ts
- **Verification:** All 239 tests pass
- **Committed in:** e49cf7c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed bugs above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JSX transform module complete, ready for signal analysis (04-02) to add _wrapProp/_fnSignal wrapping
- Event handler transform (04-03) can use isHtmlElement to determine q-e: prefix application
- Prop classification (classifyProp) available for all downstream modules
- transformAllJsx provides the integration point for walking and transforming JSX in segment bodies

---
*Phase: 04-jsx-signals-and-event-handlers*
*Completed: 2026-04-10*
