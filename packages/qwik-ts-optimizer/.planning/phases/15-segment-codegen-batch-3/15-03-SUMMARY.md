---
phase: 15-segment-codegen-batch-3
plan: 03
subsystem: optimizer
tags: [jsx-transform, key-prefix, capture-analysis, spread-props, convergence]

# Dependency graph
requires:
  - phase: 15-segment-codegen-batch-3
    plan: 02
    provides: flags bitmask, prop classification, ObjectExpression exclusion
provides:
  - path-derived JSX key prefix via SipHash-1-3 base64 encoding
  - for-of/for-in/for loop iterator variable scope collection for capture promotion
  - before-spread prop ordering in _jsxSplit varEntries
affects: [segment-codegen, convergence-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSX key prefix derived from SipHash-1-3 hash of relative file path, first 2 chars of base64"
    - "Loop iterator variables (for-of, for-in, for) collected via AST walk for capture analysis scope"
    - "Props before spread attribute go to beforeSpreadEntries, placed before _getVarProps() in varPropsPart"

key-files:
  created:
    - src/optimizer/key-prefix.ts
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "Key prefix uses SipHash-1-3 base64 first 2 chars: verified u6=test.tsx, KD=components/apps/apps.tsx"
  - "For-of loop iterator variables added to allScopeIds via AST walk of ForOfStatement/ForInStatement/ForStatement nodes"
  - "beforeSpreadEntries array separates props that appear before spread from regular varEntries for correct evaluation order"

patterns-established:
  - "computeKeyPrefix(relPath) provides deterministic 2-char prefix matching Rust optimizer"
  - "relPath threaded through JSX transform pipeline via function parameter and options interfaces"

requirements-completed: [P15-05, P15-06]

# Metrics
duration: 16min
completed: 2026-04-11
---

# Phase 15 Plan 03: Key Prefix, For-of Capture, and Convergence Sweep Summary

**Path-derived JSX key prefix, for-of loop capture promotion, spread prop ordering -- 65 convergence tests passing (up from 62), zero regressions**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-11T14:54:13Z
- **Completed:** 2026-04-11T15:10:30Z
- **Tasks:** 2
- **Files modified:** 5 (1 created)

## Accomplishments

- JSX key prefix now derived from file path hash (SipHash-1-3 base64 first 2 chars) instead of hardcoded "u6"
- For-of/for-in/for loop iterator variables correctly collected in scope analysis, enabling capture promotion to paramNames
- Props appearing before spread attribute routed to varEntries with correct ordering (before _getVarProps)
- relPath threaded through entire JSX transform pipeline (parent, body, and segment codegen)
- 3 new convergence tests passing: support_windows_paths, should_split_spread_props_with_additional_prop, should_split_spread_props_with_additional_prop2

## Task Commits

Each task was committed atomically:

1. **Task 1: Key prefix, for-of capture, spread prop ordering** - `1bee6f8` (feat)
2. **Task 2: Convergence sweep** - No code changes (all remaining failures classified as medium/complex)

## Files Created/Modified

- `src/optimizer/key-prefix.ts` - New module: computeKeyPrefix() using SipHash-1-3 base64 for deterministic 2-char prefix
- `src/optimizer/jsx-transform.ts` - JsxKeyCounter accepts prefix parameter; processProps tracks beforeSpreadEntries; transformAllJsx accepts relPath
- `src/optimizer/rewrite-parent.ts` - Thread relPath through SCallBodyJsxOptions and parent transformAllJsx calls
- `src/optimizer/segment-codegen.ts` - SegmentJsxOptions.relPath for segment body JSX key prefix
- `src/optimizer/transform.ts` - For-of/for-in/for loop iterator variable scope collection; relPath in segment jsxOptions

## Decisions Made

- **Key prefix algorithm:** SipHash-1-3 with zero keys on the relative file path, base64-encode the 8 LE bytes, take first 2 characters. Verified: test.tsx -> "u6", components/apps/apps.tsx -> "KD", matching Rust optimizer.
- **For-of scope collection:** Added a parallel AST walk branch in the intermediate scope collection code that detects ForOfStatement/ForInStatement/ForStatement nodes containing the extraction and adds their iterator variables to allScopeIds and declPositions.
- **beforeSpreadEntries:** Introduced a separate array for props that appear before the JSXSpreadAttribute in the JSX attribute list. These are placed before `..._getVarProps()` in the varPropsPart to maintain JavaScript evaluation order semantics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type error: relPath not in transformSCallBody scope**
- **Found during:** Task 1 (threading relPath to body JSX)
- **Issue:** `relPath` referenced in body JSX transform call but not available in `transformSCallBody` function scope
- **Fix:** Added `relPath` field to `SCallBodyJsxOptions` interface and threaded it from `sCallJsxOptions` construction site
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Verification:** `npx tsc --noEmit` passes for changed files

**2. [Rule 1 - Bug] Missing beforeSpreadEntries in early return**
- **Found during:** Task 1 (spread prop ordering)
- **Issue:** Early return in processProps when attributes is empty didn't include the new `beforeSpreadEntries` field
- **Fix:** Added `beforeSpreadEntries` to the early return value
- **Files modified:** src/optimizer/jsx-transform.ts

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for type safety. No scope creep.

## Remaining Phase 15 Failures (Documented for Phase 16)

### Complex fixes deferred (would require significant changes with regression risk)

| Snapshot | Issue | Category |
|----------|-------|----------|
| should_migrate_destructured_binding_with_imported_dependency | Import+destructuring migration (not _auto_) | Variable migration |
| should_split_spread_props_with_additional_prop3 | Multi-spread with interleaved const props | Spread handling |
| should_split_spread_props_with_additional_prop4 | Event props in spread context + q:p + flags | Spread+event interplay |
| should_split_spread_props_with_additional_prop5 | Function body hoisting into segment | Variable migration |
| should_transform_handler_in_for_of_loop | Flags 6 vs 4 (static children bit in loop) | Flags computation |
| should_transform_qrls_in_ternary_expression | QRL .w() chaining in ternary, prop placement | Segment codegen |
| should_move_bind_value_to_var_props | bind+spread+event interplay in _jsxSplit | Spread+bind |
| should_not_wrap_var_template_string | Prop ordering within varEntries | Prop classification |
| should_wrap_inner_inline_component_prop | _wrapProp placement, flags | Prop classification |
| should_wrap_logical_expression_in_template | Logical expr signal classification | Signal analysis |
| should_wrap_object_with_fn_signal | Flags 3 vs 2 | Flags computation |
| should_wrap_store_expression | Complex _hf + _auto_ + flags interplay | Multiple |
| ternary_prop | Segment JSX transpilation, parent import cleanup | Segment codegen |
| support_windows_paths | FIXED (key prefix) | -- |
| should_split_spread_props_with_additional_prop2 | FIXED (before-spread ordering) | -- |
| should_not_wrap_ternary_function_operator_with_fn | FIXED in Plan 02 | -- |
| transform_qrl_in_regular_prop | FIXED in Plan 02 | -- |
| should_move_props_related_to_iteration_variables_to_var_props | FIXED in Plan 02 | -- |

## Known Stubs

None - all changes are behavioral corrections, no placeholder implementations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 15 complete: 65 convergence tests passing (up from 55 baseline at phase start)
- 10 new tests gained across 3 plans (55 -> 65)
- Zero regressions at any point
- Remaining failures documented with precise diffs for Phase 16 gap closure
- Key infrastructure improvements (key prefix, for-of scope, spread ordering) benefit future convergence work

## Self-Check: PASSED

- src/optimizer/key-prefix.ts: FOUND
- 15-03-SUMMARY.md: FOUND
- Commit 1bee6f8: FOUND

---
*Phase: 15-segment-codegen-batch-3*
*Completed: 2026-04-11*
