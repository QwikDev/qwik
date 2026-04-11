---
phase: 19-jsx-transform-convergence
plan: 01
subsystem: jsx-transform
tags: [jsx, classifyProp, is_const, computeFlags, varEntries, sort]

# Dependency graph
requires:
  - phase: 16-final-convergence
    provides: baseline 74/210 convergence with JSX transform
provides:
  - classifyProp aligned with SWC is_const.rs (member expr/calls always var)
  - varEntries alphabetical sort matching SWC should_runtime_sort=false
  - Documented SWC flags bitmask semantics (static_listeners/static_subtree/moved_captures)
affects: [19-02, jsx-transform, convergence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "classifyProp matches SWC is_const.rs: member access and function calls always var"
    - "varEntries sorted alphabetically when no spread (SWC lines 2654-2678)"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts

key-decisions:
  - "Kept computeFlags !inLoop || !hasVarProps for bit 0 -- proper static_listeners requires const_idents tracking"
  - "Reverted component vs HTML prop routing -- needs is_const alignment before bucket-based routing can diverge"
  - "Reverted _wrapProp children dynamic classification -- SWC is_const depends on binding constness not call form"

patterns-established:
  - "classifyProp: SWC is_const.rs treats all member access and all function calls as var"
  - "varEntries: sorted alphabetically when no spread props present"

requirements-completed: [JSXR-01, JSXR-02, JSXR-04]

# Metrics
duration: 18min
completed: 2026-04-11
---

# Phase 19 Plan 01: JSX Transform Convergence Summary

**Aligned classifyProp with SWC is_const.rs rules (member expr/calls always var), added varEntries alphabetical sort, documented flags bitmask semantics -- convergence 74 to 75 (+1, zero regressions)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-11T20:35:25Z
- **Completed:** 2026-04-11T20:53:20Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- classifyProp now matches SWC is_const.rs: all member expressions and all function calls return 'var' unconditionally
- varEntries sorted alphabetically when no spread (matching SWC should_runtime_sort=false)
- Convergence improved from 74 to 75 (should_not_wrap_var_template_string now passes)
- Documented SWC flags bitmask semantics thoroughly in computeFlags JSDoc

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix flags bitmask and children dynamic classification** - `100fe9e` (feat) -- reverted in Task 2
2. **Task 2: Align classifyProp with SWC is_const and fix component prop routing** - `43c7053` (feat)

## Files Created/Modified
- `src/optimizer/jsx-transform.ts` - classifyProp strictness, varEntries sort, computeFlags docs

## Decisions Made

1. **Kept old computeFlags formula (!inLoop || !hasVarProps)** - Rationale: Proper SWC static_listeners tracking requires const_idents (module-scope const bindings) to be passed to classifyProp. Without this, changing to `!hasVarProps` causes 3 regressions because our classifyProp classifies synthetic QRL identifiers (local const declarations) as 'var' while SWC's is_const_expr considers them const via the const stack. The old formula coincidentally produces correct output.

2. **Reverted component vs HTML prop routing** - Rationale: SWC routes component props to var_props by default (only const props to const_props) vs HTML props to const_props by default. However, implementing this correctly requires classifyProp to match SWC's is_const_expr exactly (including const_idents). Without that alignment, component routing causes 7 test regressions.

3. **Reverted _wrapProp children dynamic classification** - Rationale: SWC's jsx_mutable for _wrapProp children depends on is_const from create_synthetic_qqsegment, which checks if underlying variable bindings are const. `const action = useX()` makes _wrapProp(action) have is_const=true, so static_subtree stays true (flags bit 1 set). Blanket 'dynamic' classification causes regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted flags bitmask change that caused regressions**
- **Found during:** Task 1 verification
- **Issue:** Changing computeFlags bit 0 from `!inLoop || !hasVarProps` to `!hasVarProps` caused 3 test regressions because our classifyProp doesn't match SWC's is_const_expr for synthetic QRL identifiers
- **Fix:** Reverted to old formula, documented SWC semantics in JSDoc for future fix
- **Files modified:** src/optimizer/jsx-transform.ts
- **Verification:** Convergence >= 74 confirmed
- **Committed in:** 43c7053

**2. [Rule 1 - Bug] Reverted _wrapProp children dynamic classification**
- **Found during:** Task 1 verification
- **Issue:** Making _wrapProp children always 'dynamic' broke 7 tests; SWC's jsx_mutable depends on is_const of the underlying expression, not the call form
- **Fix:** Kept as 'static' with TODO for precise is_const tracking
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** 43c7053

**3. [Rule 1 - Bug] Reverted component prop routing change**
- **Found during:** Task 2 verification
- **Issue:** Component elements routing var-classified props to varEntries by default caused regressions because our classifyProp doesn't have const_idents
- **Fix:** Kept unified routing with NOTE explaining future requirement
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** 43c7053

---

**Total deviations:** 3 auto-fixed (3 bug fixes via reversion)
**Impact on plan:** Three plan-prescribed changes reverted because they depend on const_idents tracking not yet implemented. The classifyProp strictness changes and varEntries sort were applied successfully. Net result is +1 convergence with zero regressions.

## Issues Encountered
- computeFlags, component prop routing, and _wrapProp children classification all depend on matching SWC's is_const_expr which requires const_idents (module-scope const bindings) tracking. This is a cross-cutting concern that should be addressed in a dedicated plan before these changes can be re-applied.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - no stubs or placeholder values.

## Next Phase Readiness
- classifyProp strictness and varEntries sort are in place
- Future plan needed for: const_idents tracking to enable proper static_listeners computation, component vs HTML prop routing, and _wrapProp children dynamic classification
- Ready for 19-02 plan execution

---
*Phase: 19-jsx-transform-convergence*
*Completed: 2026-04-11*
