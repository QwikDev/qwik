---
phase: 14-segment-codegen-batch-2
plan: 03
subsystem: optimizer
tags: [segment-codegen, bind-transform, event-merge, signal-analysis, convergence]

requires:
  - phase: 14-segment-codegen-batch-2
    provides: Nested call rewriting, TS enum transpilation, rest-props, auto-export fixes from Plans 01-02

provides:
  - Bind handler merging with pre-rewritten QRL event props into arrays
  - Attribute-order-preserving merge (bind first or QRL first based on JSX order)
  - Bind-desugared prop names always quoted matching Rust optimizer AST output
  - paramNames plumbing infrastructure for future signal analysis refinement

affects: [segment-codegen, jsx-transform, convergence]

tech-stack:
  added: []
  patterns:
    - "Pre-rewritten q-e:* event props merged with bind handlers via bindHandlers map outside loop context"
    - "Bind handler merge preserves JSX attribute order: first-appearing handler comes first in array"

key-files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "Bind-desugared prop names always quoted (formattedBindName always uses double quotes) matching Rust optimizer AST key representation"
  - "Pre-rewritten q-e:* props handled outside loop context via bindHandlers map for merge with bind handlers"
  - "Merge order preserves JSX attribute appearance order: whichever handler appears first in source comes first in array"
  - "Reverted paramNames exclusion from signal analysis: deep prop access (props.myobj.id, depth>=2) still needs _fnSignal wrapping"
  - "Flags, JSX children classification, and _fnSignal suppression deferred -- changes caused regressions when attempted broadly"

patterns-established:
  - "bindHandlers map tracks both bind-generated and pre-rewritten QRL event handlers for correct merging"

requirements-completed: [P14-04, P14-05]

duration: 26min
completed: 2026-04-11
---

# Phase 14 Plan 03: Bind Merging, Convergence Sweep Summary

**Bind:value/bind:checked correctly merged with explicit onInput$ event handlers into ordered arrays in constProps, bringing convergence from 51 to 55 passing snapshots**

## Performance

- **Duration:** 26 min
- **Started:** 2026-04-11T13:39:24Z
- **Completed:** 2026-04-11T14:05:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Pre-rewritten q-e:input event props (from extracted onInput$/onChange$) now merge with bind:value/bind:checked handlers into arrays in constProps
- Array merge order preserves JSX attribute order: `[qrl, inlinedQrl(...)]` when onInput$ before bind, `[inlinedQrl(...), qrl]` when bind before onInput$
- Bind-desugared prop names always quoted (`"value"` not `value`) matching Rust optimizer AST output
- Convergence: 55/210 passing (4 net new passes, zero regressions from 51 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Bind merging, _fnSignal suppression attempts, and targeted segment fixes** - `ae39c53` (feat)
2. **Task 2: Phase 14 convergence sweep and regression gate** - `e1ffd70` (feat)

## Files Created/Modified

- `src/optimizer/jsx-transform.ts` - Pre-rewritten q-e:* event props handled outside loop context via bindHandlers map; bind prop names always quoted; paramNames parameter plumbing (unused but available for future)
- `src/optimizer/segment-codegen.ts` - SegmentJsxOptions extended with optional paramNames set; paramNames threaded to transformAllJsx
- `src/optimizer/transform.ts` - jsxOptions construction (paramNames plumbing available)

## Decisions Made

- **Bind prop quoting**: Always quote bind-desugared prop names (`"value"`, `"checked"`) because the Rust optimizer emits string literal keys (AST type `Literal`) not identifier keys (AST type `Identifier`), and the AST comparison distinguishes these.
- **Merge order**: The array merge order follows JSX attribute appearance order. The Rust optimizer processes attributes sequentially, so `bind:value` before `onInput$` produces `[bindHandler, qrl]`, and vice versa.
- **paramNames signal exclusion reverted**: Adding function parameters to importedNames excluded them from ALL signal analysis, but deep prop access (`props.myobj.id`, depth>=2) still requires `_fnSignal` wrapping per snapshot evidence. Single-level exclusion would need a more targeted approach.
- **Flags change reverted**: Changing bit 0 to always-set caused 8 regressions because some snapshots expect flags=2 (bit 0 unset) for elements with specific varProps patterns. The flag semantics are more nuanced than documented.
- **JSX children classification unchanged**: Changing JSXElement children from 'dynamic' to 'static' caused 2 regressions despite one snapshot expecting it. The classification depends on whether child elements contain reactive content.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bind merge array order for attribute-order sensitivity**
- **Found during:** Task 2
- **Issue:** `should_merge_on_input_and_bind_value` expected bind handler first in array, but code always put QRL first
- **Fix:** Merge order now follows JSX attribute appearance order
- **Files modified:** src/optimizer/jsx-transform.ts
- **Committed in:** e1ffd70

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for correctness of reverse-order merge tests. No scope creep.

## Issues Encountered

- **_fnSignal suppression too complex for broad fix**: Adding paramNames to importedNames fixed Image component's `props.src` case but broke `should_wrap_object_with_fn_signal` where deep prop access (`props.myobj.id`) still needs `_fnSignal`. The distinction between depth-1 (no wrap) and depth-2+ (wrap) requires targeted signal analysis changes.
- **Flags bit 0 semantics unclear**: Snapshot evidence shows flags=3 both with and without varProps. Investigation revealed flags=2 occurs specifically when varProps contain prop-passed event handlers (`props.onClick$`). The flag semantics involve nuanced reactive prop classification beyond simple presence/absence of varProps.
- **JSX children classification mixed**: Some snapshots expect flags=3 (static) with _jsxSorted children, others expect flags=1 (dynamic). The correct classification depends on whether descendant elements contain reactive content, requiring deeper analysis.

## Remaining Phase 14 Gaps

Documented for future gap closure or Phase 15:

| Test | Issue | Classification |
|------|-------|---------------|
| should_ignore_passive_jsx_events_without_handlers | Flags 1 vs expected 3 (JSX children classification) | Medium |
| should_mark_props_as_var_props_for_inner_cmp | Untransformed JSX in component callback props | Complex |
| should_convert_passive_jsx_events | QRL declaration ordering + q-ep: event prefix | Medium |
| hoisted_fn_signal_in_loop | _hf numbering order + flags 5 vs 3/7 | Complex |
| example_spread_jsx | createElement vs _jsxSplit selection | Complex |
| issue_7216_add_test | Spread with interleaved event handlers + _getVarProps/_getConstProps | Complex |
| hmr | Missing _useHmr() injection + qrlDEV infrastructure | Complex |
| moves_captures_when_possible | q:ps unified slot allocation + param ordering | Complex |

## Next Phase Readiness

- Bind merging infrastructure complete for all 4 merge patterns
- 55/210 convergence (26% pass rate, up from 24%)
- Remaining failures are predominantly: flags computation (79 tests with parent passing), JSX children in segment body callbacks, spread/split JSX patterns, and key prefix computation
- The paramNames plumbing is in place for future targeted signal analysis refinement

---
*Phase: 14-segment-codegen-batch-2*
*Completed: 2026-04-11*
