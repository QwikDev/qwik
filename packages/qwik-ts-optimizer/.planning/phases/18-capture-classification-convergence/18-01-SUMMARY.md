---
phase: 18-capture-classification-convergence
plan: 01
subsystem: optimizer
tags: [capture-classification, paramNames, q:ps, jsx-transform, variable-migration]

requires:
  - phase: 17-inline-hoist-strategy-convergence
    provides: Inline/hoist body codegen and signal hoisting infrastructure
provides:
  - Alphabetical sort for non-loop event handler capture slot assignment
  - q:ps injection infrastructure for non-loop capture contexts
  - Variable migration protection for q:ps-referenced variables
  - Flag computation for capture-only (non-loop) JSX elements
affects: [capture-delivery, segment-codegen, jsx-flags]

tech-stack:
  added: []
  patterns:
    - "Non-loop captures sorted alphabetically for paramNames (SWC Rule 7)"
    - "q:ps injected for non-loop HTML elements with event handler captures"
    - "q:ps goes in varProps (2nd arg), event handlers in constProps (3rd arg)"
    - "Capture-only flag computation: base flags (no-loop) | 4 for capture bit"

key-files:
  created: []
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/jsx-transform.ts

key-decisions:
  - "Non-loop captures use alphabetical sort; loop captures keep declaration-position sort"
  - "q:ps placement in varProps matches SWC behavior for _jsxSorted call signature"
  - "Migration analysis must account for paramNames captures needed by parent q:ps"
  - "Capture-only flag uses non-loop base flags OR'd with capture bit 4"

patterns-established:
  - "Non-loop event handler q:ps: alphabetical sort, varProps placement, constProps for handlers"
  - "Migration protection: paramNames captures added to parent segment usage set"

requirements-completed: [CAP-01]

duration: 25min
completed: 2026-04-11
---

# Phase 18 Plan 01: Capture Classification Convergence Summary

**Alphabetical non-loop capture sorting, q:ps injection for component-scope event handlers, and migration protection for paramNames-captured variables**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-11T18:58:51Z
- **Completed:** 2026-04-11T19:23:51Z
- **Tasks:** 1 of 2 (Task 2 deferred -- cross-scope capture fixes require deep investigation)
- **Files modified:** 2

## Accomplishments

### Task 1: Alphabetical sort and q:ps injection for non-loop captures

1. **Alphabetical sort for non-loop paramNames** (transform.ts): Changed non-loop capture branch to sort captures alphabetically before passing to `generateParamPadding()`. Loop capture paths retain declaration-position sort to avoid regressions.

2. **q:ps injection for non-loop event handlers** (jsx-transform.ts): Extended the q:ps injection guard from `inLoop && tagIsHtml` to `tagIsHtml`, allowing qpOverrides-based q:ps injection for elements with non-loop event handler captures. This enables the `moves_captures_when_possible` pattern where component-scope captures get q:ps delivery.

3. **q:ps prop placement** (jsx-transform.ts): q:ps goes into varEntries (second arg of _jsxSorted), matching SWC behavior where variable references are mutable props. Event handlers remain in constEntries (third arg).

4. **Capture-only flag computation** (jsx-transform.ts): For non-loop capture contexts (q:ps without real loop), compute base flags as non-loop (bit 0 always set) then OR in capture bit 4. This matches SWC's flags=7 pattern for non-loop captures.

5. **Migration protection** (transform.ts): Added logic to attribute paramNames capture variables to the parent component segment's usage set, preventing `analyzeMigration()` from moving variables that are needed by q:ps at render time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] q:ps injection missing for non-loop event handlers**
- **Found during:** Task 1 diagnosis
- **Issue:** The JSX transform only injected q:ps when `inLoop && tagIsHtml`, but SWC Rule 5 requires q:ps for non-loop captures too
- **Fix:** Extended guard to `tagIsHtml`, allowing qpOverrides-based injection
- **Files modified:** src/optimizer/jsx-transform.ts

**2. [Rule 2 - Missing] Variable migration not accounting for paramNames captures**
- **Found during:** Task 1 verification
- **Issue:** Variables captured via paramNames (not captureNames) were being migrated away from the parent component, breaking q:ps references
- **Fix:** Added paramNames capture vars to parent segment's usage set before migration analysis
- **Files modified:** src/optimizer/transform.ts

**3. [Rule 1 - Bug] q:ps placed in wrong _jsxSorted argument position**
- **Found during:** Task 1 verification
- **Issue:** q:ps initially placed in constProps (3rd arg) but SWC puts it in varProps (2nd arg)
- **Fix:** Changed q:ps to push to varEntries instead of constEntries
- **Files modified:** src/optimizer/jsx-transform.ts

**4. [Rule 1 - Bug] Loop slot unification sort caused regressions**
- **Found during:** Task 1 verification
- **Issue:** Plan prescribed alphabetical sort for allLoopLocals and allVars, but this caused 4 regressions in loop-related tests
- **Fix:** Reverted loop slot unification back to declaration-position sort; alphabetical sort only for non-loop path
- **Files modified:** src/optimizer/transform.ts

## Deferred Issues

### Task 2: Cross-scope capture delivery

Task 2 was investigated but not completed. The following capture-related tests remain failing:
- `example_multi_capture` -- requires _rawProps capture handling and .w() on bare $() calls
- `example_capture_imports` -- requires capture import pattern fixes
- `example_functional_component_capture_props` -- requires _rawProps single-capture handling

Root causes identified:
1. The _rawProps destructuring transform needs to produce `_rawProps` as a single capture variable
2. Nested $() calls need .w() wrapping when they have captureNames
3. The segment body codegen needs correct _captures injection

### Remaining flags mismatch

The `moves_captures_when_possible` test produces flags=5 where SWC produces flags=7. The difference is bit 1 (children static): SWC considers bare identifier children like `{sig}` as static, while our code classifies them as dynamic. This is a children classification issue, not a capture issue. The q:ps values and handler paramNames are correct.

## Verification

- Convergence: 73/210 passed (zero regressions from baseline)
- Full test suite: 555 passed (30/33 test files pass, 3 convergence-related fail)

## Self-Check: PASSED

All modified files exist and commit b0e74e0 verified.
