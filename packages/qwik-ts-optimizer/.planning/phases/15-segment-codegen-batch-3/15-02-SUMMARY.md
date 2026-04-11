---
phase: 15-segment-codegen-batch-3
plan: 02
subsystem: optimizer
tags: [jsx-transform, signal-analysis, flags, prop-classification, convergence]

# Dependency graph
requires:
  - phase: 15-segment-codegen-batch-3
    plan: 01
    provides: bind spread pre-scan, router QRL mapping, _auto_ suppression
provides:
  - corrected computeFlags bitmask matching Rust optimizer
  - ObjectExpression exclusion from _fnSignal wrapping
  - component element prop classification for _wrapProp and _fnSignal
affects: [15-03, segment-codegen, convergence-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outside loop context, bit 0 of flags is always set regardless of varProps"
    - "Loop bit (4) only applies to HTML elements with q:p/q:ps event handler captures"
    - "ObjectExpression values classified as var (never wrapped in _fnSignal)"
    - "Component elements: _wrapProp store field to constEntries, _fnSignal in loop to varEntries"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/signal-analysis.ts
    - tests/optimizer/jsx-transform.test.ts

key-decisions:
  - "Flags bit 0 always set outside loop: corpus analysis confirmed no flags=0 or flags=2 values in non-loop snapshots"
  - "Loop bit restricted to HTML elements: component elements in loops use varEntries placement instead of bit 2"
  - "ObjectExpression excluded from _fnSignal: Rust optimizer treats object literals as var props, not signal expressions"

patterns-established:
  - "Evidence-first approach: collect truth table from snapshot corpus before modifying flags"
  - "Loop context distinction: HTML elements get bit 2 flag, component elements get varEntries placement"

requirements-completed: [P15-03]

# Metrics
duration: 13min
completed: 2026-04-11
---

# Phase 15 Plan 02: Flags Bitmask and Prop Classification Summary

**Fixed computeFlags to match Rust semantics (bit 0 always set outside loop, ObjectExpression excluded from _fnSignal, component element prop classification corrected) -- 62 convergence tests passing (up from 59)**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-11T14:37:47Z
- **Completed:** 2026-04-11T14:51:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Fixed computeFlags bitmask: bit 0 (immutable) always set outside loop context, matching Rust corpus where non-loop elements always have flags=1 or flags=3
- Loop bit (4) restricted to HTML elements with q:p/q:ps captures; component elements in loops don't get the loop flag
- ObjectExpression values excluded from _fnSignal wrapping -- object literals go as var props
- _wrapProp store field (2-arg form) on component elements goes to constEntries instead of varEntries
- _fnSignal on component elements in loop context goes to varEntries (iteration variable dependency)
- 3 new convergence tests passing: should_not_wrap_ternary_function_operator_with_fn, transform_qrl_in_regular_prop, should_move_props_related_to_iteration_variables_to_var_props
- Unit tests updated with 2 new loop-context flag tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix flags bitmask and prop classification** - `83b256b` (feat)

## Files Created/Modified

- `src/optimizer/jsx-transform.ts` - computeFlags simplified (bit 0 always set outside loop); effectiveLoopCtx restricted to tagIsHtml; _wrapProp store field on component elements to constEntries; _fnSignal in loop on component elements to varEntries
- `src/optimizer/signal-analysis.ts` - ObjectExpression early return before compound expression handling (returns type: 'none')
- `tests/optimizer/jsx-transform.test.ts` - Updated computeFlags unit tests for new semantics, added loop-context test cases

## Decisions Made

- **Bit 0 always set outside loop:** Extensive corpus analysis showed only flags=1 and flags=3 in non-loop snapshots. Even elements with varProps get bit 0 set. The hasVarProps parameter only affects flags inside loop contexts with q:p captures.
- **Loop bit restricted to HTML elements:** Component elements inside loops (e.g., .map() callbacks) don't get the loop bit (4). Instead, their reactive props are moved to varEntries. Only HTML elements with q:p/q:ps event handler captures get the loop flag.
- **ObjectExpression not wrapped:** Rust optimizer treats `class={{ ... }}` as a regular var prop, not a signal expression. Even when the object contains reactive store accesses, the entire ObjectExpression is placed as-is in varEntries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Loop bit regression prevention**
- **Found during:** Task 1
- **Issue:** Initial fix removed loop bit entirely, causing 9 regressions in loop event handler tests (should_transform_block_scoped_variables_in_loop etc.)
- **Fix:** Restored loop bit but restricted to HTML elements with q:p (effectiveLoopCtx gated on tagIsHtml)
- **Files modified:** src/optimizer/jsx-transform.ts
- **Verification:** All 9 loop tests restored, zero net regressions

## Deferred Issues

- `should_wrap_inner_inline_component_prop` - children type classification: _wrapProp(props, "id") in array should be classified as dynamic; currently classified as static giving flags=3 instead of expected flags=1
- `should_wrap_object_with_fn_signal` - _fnSignal placement on HTML elements with paramName deps: _fnSignal should go to varEntries when dep is a function parameter
- `should_wrap_store_expression` - complex interplay between ObjectExpression var classification and _fnSignal constEntries placement on same element

## Known Stubs

None - all changes are behavioral corrections, no placeholder implementations.

## Self-Check: PASSED

---
*Phase: 15-segment-codegen-batch-3*
*Completed: 2026-04-11*
