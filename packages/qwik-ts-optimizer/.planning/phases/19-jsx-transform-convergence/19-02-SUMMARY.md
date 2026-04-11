---
phase: 19-jsx-transform-convergence
plan: 02
subsystem: jsx-transform
tags: [jsx, createElement, spread, signal-wrapping, convergence]

# Dependency graph
requires:
  - phase: 19-jsx-transform-convergence
    provides: classifyProp alignment, varEntries sort, 75/210 baseline
provides:
  - _createElement fallback for spread+key JSX elements
  - Diagnostic categorization of remaining 135 failing convergence tests
affects: [Phase 20, const_idents tracking, capture classification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_createElement emitted for spread+key via 'createElement as _createElement' import alias"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts

key-decisions:
  - "Signal wrapping edge cases are not fixable in JSX transform alone -- they require const_idents tracking"
  - "Remaining 135 failures categorized: 36 parent-only, 67 segment-only, 32 both; root causes are const_idents, captures, migration"

patterns-established:
  - "Import alias pattern: add 'createElement as _createElement' to neededImports Set for correct aliased import generation"

requirements-completed: [JSXR-03, JSXR-04]

# Metrics
duration: 8min
completed: 2026-04-11
---

# Phase 19 Plan 02: createElement Fallback and Signal Wrapping Diagnostics Summary

**Added _createElement fallback for spread+key JSX elements, diagnosed remaining signal wrapping divergences as const_idents/capture issues outside JSX transform scope -- convergence holds at 75/210 (zero regressions)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-11T20:55:39Z
- **Completed:** 2026-04-11T21:03:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added _createElement fallback path in transformJsxElement: when JSX has both spread props AND explicit key, emits `_createElement(tag, {...spread, key: keyExpr})` instead of `_jsxSplit`
- Import aliased correctly as `createElement as _createElement` from `@qwik.dev/core`, matching SWC snapshot output
- Spread-only (no key) continues to use `_jsxSplit` path unchanged
- Comprehensive diagnostic of remaining 135 failing convergence tests:
  - 36 parent-only failures (segment code matches, parent module doesn't -- import ordering, _hf placement)
  - 67 segment-only failures (parent matches, segments don't -- const_idents, captures, migration)
  - 32 both-fail (multiple root causes)
- Signal wrapping (_wrapProp/_fnSignal) placement itself is correct; remaining failures are downstream of classifyProp/const_idents

## Task Commits

1. **Task 1: Add _createElement fallback for spread+key JSX elements** - `4286b8e` (feat)
2. **Task 2: Diagnose signal wrapping divergences** - No code changes; diagnostic-only task

## Files Created/Modified

- `src/optimizer/jsx-transform.ts` - _createElement fallback branch in hasSpread block

## Decisions Made

1. **Signal wrapping edge cases resolved by upstream changes** - Rationale: Diagnostic analysis showed that _wrapProp and _fnSignal placement in children and props is already correct. The remaining segment failures with "signal" in their name (example_class_name, example_derived_signals_div, etc.) actually fail due to classifyProp treating local `const` identifiers as var (missing const_idents tracking), not signal wrapping issues. This is the same root cause identified in Plan 01.

2. **Remaining failures categorized for future phases** - Rationale: Of 135 failing tests, none are fixable by further JSX transform changes alone. The three root cause categories are: (a) const_idents tracking needed for classifyProp to match SWC is_const_expr, (b) capture classification and variable migration differences, (c) _qrlSync serialization. These belong to Phase 20+.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The _createElement change alone doesn't fix the example_spread_jsx test because it has other pre-existing divergences (q:p injection in loop context, signal wrapping for `dangerouslySetInnerHTML: s.style` vs `_wrapProp(s, "style")`). The _createElement emission itself is correct and matches the snapshot pattern.

## User Setup Required

None.

## Known Stubs

None.

## Next Phase Readiness

- All JSX transform changes in Phase 19 scope are complete
- Future work needed: const_idents tracking (enables proper static_listeners, component prop routing, _wrapProp children dynamic classification)
- Future work needed: capture classification alignment, variable migration edge cases, _qrlSync

## Self-Check: PASSED

- FOUND: src/optimizer/jsx-transform.ts
- FOUND: .planning/phases/19-jsx-transform-convergence/19-02-SUMMARY.md
- FOUND: commit 4286b8e (Task 1)
- FOUND: commit 45479d7 (docs)

---
*Phase: 19-jsx-transform-convergence*
*Completed: 2026-04-11*
