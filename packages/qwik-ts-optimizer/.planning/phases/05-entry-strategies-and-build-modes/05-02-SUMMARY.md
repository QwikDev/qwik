---
phase: 05-entry-strategies-and-build-modes
plan: 02
subsystem: optimizer
tags: [inline-strategy, strip-ctx, _noopQrl, sentinel-counter, entry-strategy]

requires:
  - phase: 05-01
    provides: resolveEntryField(), dev mode builders, entry strategy types
  - phase: 02
    provides: extraction pipeline, rewrite-parent, segment-codegen
provides:
  - inline-strategy.ts with _noopQrl/_noopQrlDEV declaration builders
  - strip-ctx.ts with isStrippedSegment() and generateStrippedSegmentCode()
  - Pipeline wiring for inline/hoist entry strategy (no separate segment files)
  - Pipeline wiring for stripCtxName/stripEventHandlers (null exports, loc [0,0])
  - Sentinel counter naming for stripped segment QRL variables
affects: [05-03, snapshot-testing]

tech-stack:
  added: []
  patterns: [sentinel-counter-naming, inline-strategy-branching, strip-mode-branching]

key-files:
  created:
    - src/optimizer/inline-strategy.ts
    - src/optimizer/strip-ctx.ts
    - tests/optimizer/inline-strategy.test.ts
    - tests/optimizer/strip-ctx.test.ts
  modified:
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts

key-decisions:
  - "Pre-compute QRL variable names before call site rewriting so stripped segments use sentinel names in both declarations and call sites"
  - "Inline strategy emits TransformModule entries for metadata tracking but with empty code (code is in parent)"
  - "Stripped counter resets per file (each input file has its own counter starting at 0)"

patterns-established:
  - "Sentinel counter formula: 0xFFFF0000 + index * 2 for stripped segment variable naming"
  - "InlineStrategyOptions interface for passing inline/strip config through pipeline"
  - "earlyQrlVarNames pre-computation pattern for variable name resolution before call site rewriting"

requirements-completed: [ENT-02, MODE-04, MODE-05]

duration: 4min
completed: 2026-04-10
---

# Phase 05 Plan 02: Inline/Hoist Entry Strategy and Strip Modes Summary

**Inline/hoist strategy using _noopQrl + .s() pattern and server/client strip modes with sentinel-counter QRL naming and null exports**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-10T22:14:00Z
- **Completed:** 2026-04-10T22:18:33Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built inline-strategy.ts with 6 exported builder functions for _noopQrl, _noopQrlDEV, stripped variants, and .s() calls
- Built strip-ctx.ts with isStrippedSegment() prefix matching and generateStrippedSegmentCode() null export generation
- Wired inline/hoist strategy into transform.ts and rewrite-parent.ts: inline mode produces _noopQrl declarations + .s() calls in parent, no separate segment files
- Wired stripCtxName/stripEventHandlers into pipeline: stripped segments get loc=[0,0], null export code, and sentinel-named QRL variables
- 421 tests passing (24 new + 397 existing, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline strategy and strip context builders** - `9c3c8e8` (feat, TDD)
2. **Task 2: Wire inline strategy and strip modes into pipeline** - `40c4706` (feat)

## Files Created/Modified
- `src/optimizer/inline-strategy.ts` - _noopQrl/_noopQrlDEV declaration builders, .s() call builder, sentinel counter
- `src/optimizer/strip-ctx.ts` - isStrippedSegment() prefix/event handler matching, null export code gen
- `tests/optimizer/inline-strategy.test.ts` - 14 unit tests for all inline strategy builders
- `tests/optimizer/strip-ctx.test.ts` - 10 unit tests for strip detection and code generation
- `src/optimizer/transform.ts` - Added inline strategy branching, strip mode detection, stripped segment handling
- `src/optimizer/rewrite-parent.ts` - Added InlineStrategyOptions, inline QRL declaration branch, .s() call emission, sentinel naming pre-computation

## Decisions Made
- Pre-compute QRL variable names (earlyQrlVarNames map) before call site rewriting so stripped segments use correct sentinel names in both QRL declarations and call site references
- Inline strategy TransformModule entries have empty code string (all code is in parent module) but still carry SegmentAnalysis metadata for downstream consumers
- Stripped counter is per-file (resets for each input file), matching Rust optimizer behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Inline/hoist and strip modes are wired in; snapshot tests for these modes can now be enabled in 05-03
- Lib mode (inlinedQrl pattern) is noted in the plan but deferred to snapshot validation
- Const replacement (isServer/isBrowser/isDev) and strip exports still needed in 05-03

---
*Phase: 05-entry-strategies-and-build-modes*
*Completed: 2026-04-10*
