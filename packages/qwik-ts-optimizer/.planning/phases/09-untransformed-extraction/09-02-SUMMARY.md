---
phase: 09-untransformed-extraction
plan: 02
subsystem: optimizer
tags: [input-repair, parse-recovery, oxc-parser, swc-compatibility]

# Dependency graph
requires:
  - phase: 09-untransformed-extraction
    plan: 01
    provides: broadened marker detection for non-Qwik packages
provides:
  - repairInput() function for SWC-recoverable parse error recovery
  - Strategy A: unmatched closing paren removal
  - Strategy B: JSX text with > converted to string expression containers
affects: [09-untransformed-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parse-then-repair: only apply repairs when parseSync returns empty body with errors"
    - "JSX text with > wrapped as string expression containers to match SWC behavior"

key-files:
  created:
    - src/optimizer/input-repair.ts
  modified:
    - src/optimizer/transform.ts

key-decisions:
  - "repairInput is a no-op for well-formed inputs -- only activates on empty program body with errors"
  - "JSX text containing > is wrapped as string expression containers rather than expression containers, matching SWC output behavior"
  - "Repaired source used consistently throughout entire pipeline (extraction, capture analysis, parent rewriting) so positions remain consistent"

patterns-established:
  - "Input repair as pipeline preprocessing: repair before extraction so all downstream operations use consistent positions"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-04-11
---

# Phase 09 Plan 02: Input Repair for Parse Error Recovery Summary

**Added repairInput() preprocessing to handle two SWC-recoverable parse error patterns: unmatched closing parens and JSX text containing > characters**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-11T07:23:03Z
- **Completed:** 2026-04-11T07:34:20Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created src/optimizer/input-repair.ts with two repair strategies for parse errors that SWC recovers from but oxc-parser does not
- Strategy A removes unmatched closing parens (example_3: stray `)` before `};`)
- Strategy B wraps JSX text containing `>` as `{"text"}` string expression containers (example_immutable_analysis: `[].map(() => (` as raw JSX text)
- Integrated repairInput into transform.ts pipeline, applied before extractSegments with repaired source used throughout
- example_3 now fully passes convergence (parent + segments)
- example_immutable_analysis now passes parent module match (segments deferred to later plans)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create input repair module and integrate into transform pipeline** - `225ceeb` (feat)

## Files Created/Modified
- `src/optimizer/input-repair.ts` - New module with repairInput(), tryRemoveUnmatchedParens(), tryWrapJsxTextArrows(), findJsxTextRegionsWithGt()
- `src/optimizer/transform.ts` - Import repairInput, apply before extractSegments, use repairedCode throughout pipeline

## Decisions Made
- repairInput only activates when parseSync returns empty program body with errors -- well-formed inputs pass through unchanged (threat mitigation T-09-02)
- JSX text with `>` wrapped as `{"text"}` (string expression container) rather than `{text}` (expression container) because the text may contain unmatched parens that would be invalid JS expressions
- Repaired source replaces input.code throughout the entire per-file processing loop to maintain position consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- example_immutable_analysis segments still differ from expected (pre-existing issue unrelated to parsing). The plan's goal was parse error recovery; parent module match is achieved.
- Initial JSX text detection incorrectly flagged lone `>` characters on their own line (closing bracket of multi-line JSX opening elements like `<Div ... >`). Fixed by adding `trimmed === '>'` skip condition.

## Next Phase Readiness
- Both parse-error snapshots now produce output instead of empty passthrough
- example_3 fully converges; example_immutable_analysis parent matches
- No regressions: 476 unit tests pass, 31 test files pass

---
*Phase: 09-untransformed-extraction*
*Completed: 2026-04-11*
