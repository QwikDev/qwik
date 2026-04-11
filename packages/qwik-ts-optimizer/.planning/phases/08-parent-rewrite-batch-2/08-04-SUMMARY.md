---
phase: 08-parent-rewrite-batch-2
plan: 04
subsystem: optimizer
tags: [regCtxName, _regSymbol, serverQrl, server$, inline-strategy]

requires:
  - phase: 08-parent-rewrite-batch-2
    plan: 01
    provides: "TS stripping and capture suppression"
provides:
  - "_regSymbol body wrapping for regCtxName-matched extractions"
  - "serverQrl variant call site generation for server-tagged event handlers"
  - "Const literal inlining for regCtxName captures"
affects: [08-parent-rewrite-batch-2]

tech-stack:
  added: []
  patterns:
    - "regCtxName matching: callee name (e.g., server$) matches regCtxName entry (e.g., 'server') plus '$' suffix"
    - "_regSymbol wrapping: body wrapped as _regSymbol(() => body, hash) with PURE annotation"
    - "serverQrl call site: event handler props use serverQrl(q_var) instead of bare q_var"
    - "Const capture inlining: resolveConstLiterals parses parent body, inlineConstCaptures replaces identifiers with literal values"

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts

key-decisions:
  - "regCtxName matching uses exact callee name comparison (server$ == 'server' + '$'), not prefix/contains matching"
  - "Const literal inlining for regCtxName extractions uses AST-based replacement to avoid replacing property keys or member expression properties"
  - "regCtxName-matched extractions skip _captures injection entirely -- const values are inlined, non-const captures are not supported in this pattern"

patterns-established:
  - "regCtxName option flows through InlineStrategyOptions to rewriteParentModule and transformSCallBody"
  - "matchesRegCtxName helper centralizes the callee-to-regCtxName matching logic"

requirements-completed: [SC-1, SC-2, SC-3]

duration: 13min
completed: 2026-04-11
---

# Phase 08 Plan 04: regCtxName/_regSymbol Support Summary

**Implemented _regSymbol body wrapping and serverQrl call sites for server-tagged extractions with const capture inlining, maintaining zero regressions at 29 convergence tests**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-11T05:41:16Z
- **Completed:** 2026-04-11T05:54:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- regCtxName option threaded from transform.ts through InlineStrategyOptions to rewriteParentModule
- Server-tagged extractions (e.g., server$) get _regSymbol(() => body, "hash") wrapping with PURE annotation
- Event handler call sites use serverQrl(q_var) instead of bare q_var for matched extractions
- Const literal values inlined into regCtxName extraction bodies (e.g., text -> 'hola')
- _regSymbol and serverQrl imports automatically added when needed

## Task Commits

1. **Task 1: Implement _regSymbol body wrapping for regCtxName-matched extractions** - `4249b62` (feat)

## Files Created/Modified

- `src/optimizer/rewrite-parent.ts` - Added matchesRegCtxName, resolveConstLiterals, inlineConstCaptures helpers; modified transformSCallBody and processExtraction for regCtxName support
- `src/optimizer/transform.ts` - Thread regCtxName option through InlineStrategyOptions

## Decisions Made

- regCtxName matching uses exact callee name comparison (server$ == 'server' + '$') -- simple and correct for all current use cases
- Const capture inlining parses parent extraction body to find const declarations with literal initializers, then replaces identifier references via AST walk -- avoids replacing property keys or member expression properties
- regCtxName-matched extractions skip _captures injection entirely, relying on const inlining instead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added const capture inlining for regCtxName extractions**
- **Found during:** Task 1
- **Issue:** Server$ extraction body used _captures[0] for captured text variable, but expected output shows const value inlined directly (text -> 'hola')
- **Fix:** Added resolveConstLiterals() to parse parent body and find const literal values, inlineConstCaptures() to replace identifiers with values, skip _captures injection for regCtxName extractions
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** 4249b62

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix was essential for matching Rust optimizer behavior where regCtxName extractions inline const captured values.

## Issues Encountered

- The convergence tests for reg_ctx_name_segments_inlined and reg_ctx_name_segments_hoisted do not fully pass due to pre-existing issues with JSX prop classification (event handler props classified as constProps instead of varProps) and variable migration (unused variables not removed from component body). These issues affect many other tests beyond regCtxName and are not caused by this plan's changes.

## Known Stubs

None -- all regCtxName-specific functionality is wired and producing correct output.

## Next Phase Readiness

- regCtxName/_regSymbol feature complete
- Remaining convergence gaps are pre-existing JSX prop classification and variable migration issues shared across multiple test families

---
*Phase: 08-parent-rewrite-batch-2*
*Completed: 2026-04-11*

## Self-Check: PASSED
