---
phase: 04-jsx-signals-and-event-handlers
plan: 03
subsystem: optimizer
tags: [event-handlers, bind-syntax, jsx, qwik, kebab-case, passive-events, inlinedQrl]

# Dependency graph
requires:
  - phase: 04-jsx-signals-and-event-handlers (plans 01-02)
    provides: JSX element transformation and signal analysis modules
provides:
  - Event handler prop naming (q-e:/q-d:/q-w: prefixes with passive variants)
  - Bind syntax desugaring (bind:value, bind:checked -> inlinedQrl handlers)
  - Passive event directive collection
  - Event handler merge utility for array-merging coexisting handlers
affects: [04-04-loop-hoisting, 04-05-integration, snapshot-matching]

# Tech tracking
tech-stack:
  added: []
  patterns: [event-name-normalization-matching-rust, bind-desugaring-with-inlinedQrl]

key-files:
  created:
    - src/optimizer/event-handler-transform.ts
    - src/optimizer/bind-transform.ts
    - tests/optimizer/event-handler-transform.test.ts
    - tests/optimizer/bind-transform.test.ts
  modified: []

key-decisions:
  - "Event naming algorithm matched exactly to Rust's normalize_jsx_event_name + create_event_name (dashes become double-dashes, custom on- prefix preserves case before kebab)"
  - "Bind desugaring produces string code representations (not AST) for inlinedQrl calls, to be emitted via magic-string"

patterns-established:
  - "Event name normalization: strip on prefix, normalize via createEventName (dash->double-dash, uppercase->dash+lower)"
  - "Bind transform returns BindTransformResult with handler code + needed imports for integration layer"

requirements-completed: [EVT-01, EVT-02, EVT-03, EVT-04, EVT-05, EVT-06, BIND-01, BIND-02, BIND-03]

# Metrics
duration: 7min
completed: 2026-04-10
---

# Phase 04 Plan 03: Event Handlers and Bind Syntax Summary

**Event handler prop naming with scope prefixes (q-e/q-d/q-w), passive variants, and bind:value/bind:checked desugaring to inlinedQrl handlers**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-10T20:55:15Z
- **Completed:** 2026-04-10T21:02:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Event handler naming module matching Rust optimizer's exact algorithm (normalize + createEventName)
- Bind syntax desugaring with inlinedQrl(_val/_chk) handler generation
- 53 tests covering all event and bind patterns from snapshot corpus
- Passive event prefix mapping (q-ep/q-wp/q-dp) with directive collection

## Task Commits

Each task was committed atomically:

1. **Task 1: Event handler naming rules, scope prefixes, and passive events** - `6dae7d0` (feat)
2. **Task 2: Bind:value, bind:checked, and unknown bind passthrough** - `10940c2` (feat)

_Both tasks followed TDD: tests written first (RED), then implementation (GREEN)._

## Files Created/Modified
- `src/optimizer/event-handler-transform.ts` - Event prop naming with scope prefixes, passive detection, Rust-matched normalization
- `src/optimizer/bind-transform.ts` - Bind syntax desugaring with inlinedQrl handler generation and merge utility
- `tests/optimizer/event-handler-transform.test.ts` - 38 tests for event naming patterns
- `tests/optimizer/bind-transform.test.ts` - 15 tests for bind desugaring patterns

## Decisions Made
- **Event naming matched to Rust source:** Read the actual Rust optimizer's `normalize_jsx_event_name` and `create_event_name` functions to match the exact algorithm. Key insight: dashes in event names become double-dashes because `create_event_name` pushes `-` before each `-` character. The `on-` prefix (custom events) preserves original casing before kebab conversion, while standard `on` prefix lowercases everything first.
- **Bind handler as string code:** `transformBindProp` returns handler code as a string (`'inlinedQrl(_val, "_val", [value])'`) rather than AST nodes. This matches the magic-string codegen approach used throughout the optimizer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed event naming algorithm to match Rust optimizer exactly**
- **Found during:** Task 1 (event-handler-transform.ts)
- **Issue:** Initial camelToKebab approach produced `document-s-croll` instead of `document--scroll` for `onDocument-sCroll$`. Plan's research summary rules were insufficient to derive the correct algorithm.
- **Fix:** Read actual Rust source code (`normalize_jsx_event_name` + `create_event_name` in transform.rs) and implemented the exact same algorithm: lowercase first (unless starts with `-`), then convert each uppercase/dash to `-` + lowered char.
- **Files modified:** src/optimizer/event-handler-transform.ts
- **Verification:** All 38 tests pass including `onDocument-sCroll$` -> `q-e:document--scroll`
- **Committed in:** 6dae7d0

**2. [Rule 1 - Bug] Fixed custom$ detection as non-event prop**
- **Found during:** Task 1 test writing
- **Issue:** Test initially expected `custom$` to be detected as an event prop, but snapshot shows `custom$` passes through unchanged (stays as `custom$` key in constProps, not transformed to `q-e:*`).
- **Fix:** Corrected `isEventProp` to only match props starting with `on` (with optional scope prefix), not arbitrary `$`-suffixed props.
- **Files modified:** tests/optimizer/event-handler-transform.test.ts
- **Verification:** Test correctly expects `isEventProp('custom$')` to return false
- **Committed in:** 6dae7d0

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes essential for correctness. Event naming algorithm was the critical discovery -- plan's research summary was incomplete for the dash-doubling behavior.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event handler naming and bind desugaring modules ready for integration into JSX transform pipeline
- Plan 04-04 (loop hoisting) can use `transformEventPropName` for event names in loop-hoisted handlers
- Plan 04-05 (integration) will wire these modules into `jsx-transform.ts` prop processing

## Self-Check: PASSED

- All 4 created files exist on disk
- Commit 6dae7d0 (Task 1) verified in git log
- Commit 10940c2 (Task 2) verified in git log
- 317 total tests passing (no regressions from 302 baseline)

---
*Phase: 04-jsx-signals-and-event-handlers*
*Completed: 2026-04-10*
