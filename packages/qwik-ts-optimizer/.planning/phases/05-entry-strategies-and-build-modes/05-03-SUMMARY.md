---
phase: 05-entry-strategies-and-build-modes
plan: 03
subsystem: optimizer
tags: [strip-exports, const-replacement, isServer, isBrowser, isDev, magic-string]

# Dependency graph
requires:
  - phase: 05-01
    provides: entry strategy resolution and dev mode infrastructure
provides:
  - stripExportDeclarations() for replacing exports with throw statements
  - replaceConstants() for isServer/isBrowser/isDev boolean substitution
  - Pipeline wiring for stripExports and isServer options
affects: [06-snapshot-convergence]

# Tech tracking
tech-stack:
  added: []
  patterns: [import-aware-replacement, unused-import-cleanup]

key-files:
  created:
    - src/optimizer/strip-exports.ts
    - src/optimizer/const-replacement.ts
    - tests/optimizer/strip-exports.test.ts
    - tests/optimizer/const-replacement.test.ts
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts

key-decisions:
  - "Const replacement applied in parent rewrite after import rewriting, before nesting detection"
  - "DCE (dead code elimination) intentionally NOT implemented -- downstream bundler handles it"

patterns-established:
  - "Import-aware replacement: only replace identifiers that trace to actual imports, not user-defined variables"
  - "Unused import cleanup: after code stripping, scan remaining live code for import usage"

requirements-completed: [MODE-06, MODE-07]

# Metrics
duration: 4min
completed: 2026-04-10
---

# Phase 05 Plan 03: Strip Exports and Const Replacement Summary

**Strip exports replaces specified export bodies with throw statements removing unused imports; const replacement substitutes isServer/isBrowser/isDev from qwik imports with boolean literals based on build config**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-10T22:19:49Z
- **Completed:** 2026-04-10T22:23:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Strip exports module that replaces export initializers with throw statements and cleans up unused imports
- Const replacement module that substitutes isServer/isBrowser/isDev identifiers from qwik package imports with boolean literals
- Both transforms wired into the parent rewrite pipeline, gated by options
- 21 new tests, 442 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Strip exports and const replacement modules** (TDD)
   - `1e3b1ff` (test: failing tests for strip exports and const replacement)
   - `10ef39b` (feat: implement strip exports and const replacement modules)
2. **Task 2: Wire into pipeline** - `66f0d85` (feat: wire strip exports and const replacement into pipeline)

## Files Created/Modified
- `src/optimizer/strip-exports.ts` - stripExportDeclarations() with throw replacement and import cleanup
- `src/optimizer/const-replacement.ts` - replaceConstants() with import-aware identifier substitution
- `src/optimizer/rewrite-parent.ts` - Added strip exports and const replacement steps to parent rewrite
- `src/optimizer/transform.ts` - Passes stripExports and isServer options through to rewriteParentModule
- `tests/optimizer/strip-exports.test.ts` - 8 tests covering throw format, import cleanup, shared imports
- `tests/optimizer/const-replacement.test.ts` - 13 tests covering server/browser/dev replacement, aliases, import removal

## Decisions Made
- Const replacement applied after import rewriting but before nesting/call-site detection -- this ensures import map is built but doesn't conflict with QRL variable name insertions
- DCE (dead code elimination) intentionally skipped per plan -- downstream bundlers handle if(false) branch removal
- isDev derived from mode option: dev=true, prod=false, lib/undefined=skip

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 05 plans complete (entry strategies, inline/strip modes, strip exports, const replacement)
- Ready for Phase 06 snapshot convergence and final validation

---
*Phase: 05-entry-strategies-and-build-modes*
*Completed: 2026-04-10*
