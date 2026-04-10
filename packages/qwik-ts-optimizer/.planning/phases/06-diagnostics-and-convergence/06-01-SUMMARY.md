---
phase: 06-diagnostics-and-convergence
plan: 01
subsystem: diagnostics
tags: [qwik, optimizer, diagnostics, ast, suppression]

requires:
  - phase: 03-capture-analysis
    provides: capture detection and scope tracking
  - phase: 04-jsx-signals-events
    provides: JSX transform, event handler transform, passive directive detection
provides:
  - Diagnostic emission functions (C02, C03, C05, preventdefault-passive-check)
  - "@qwik-disable-next-line suppression directive parsing and filtering"
  - Diagnostics wired into transformModule() pipeline
affects: [06-diagnostics-and-convergence, snapshot-testing]

tech-stack:
  added: []
  patterns: [diagnostic-emission-functions, line-based-suppression-directives]

key-files:
  created:
    - src/optimizer/diagnostics.ts
    - tests/optimizer/diagnostics.test.ts
  modified:
    - src/optimizer/types.ts
    - src/optimizer/transform.ts
    - tests/optimizer/types.test.ts

key-decisions:
  - "Diagnostic type updated to match snapshot format: category (not severity), scope, suggestions, flat highlights"
  - "C02 detection uses independent body parsing per extraction rather than shared closureNodes map to avoid symbolName collisions"
  - "C02 message says 'it is a function' for both fn and class declarations (verified from snapshot corpus)"
  - "C05 detects exported $-suffixed functions missing corresponding Qrl exports at call sites"

patterns-established:
  - "Diagnostic emission: standalone pure functions returning Diagnostic objects"
  - "Suppression: line-based @qwik-disable-next-line parsed from source, applied as post-filter"

requirements-completed: [DIAG-01, DIAG-02, DIAG-03, DIAG-04]

duration: 9min
completed: 2026-04-10
---

# Phase 06 Plan 01: Diagnostics Module Summary

**C02/C03/C05/preventdefault-passive-check diagnostic emission with @qwik-disable-next-line suppression wired into transform pipeline**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-10T22:44:41Z
- **Completed:** 2026-04-10T22:53:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created diagnostics module with emission functions for all 4 diagnostic codes matching snapshot format exactly
- Wired C02 (fn/class captures), C05 (missing Qrl exports), and preventdefault-passive-check into transform pipeline
- Implemented @qwik-disable-next-line comment directive parsing supporting single and multi-code suppression
- Updated Diagnostic type interface from severity-based to snapshot-compatible category/scope/flat-highlights format
- 464 tests passing across 29 test files with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create diagnostics module with C02/C03 detection and suppression** - `e960fc5` (feat)
2. **Task 2: Add C05/preventdefault-passive-check and wire all diagnostics into transform pipeline** - `3db0b4e` (feat)

## Files Created/Modified
- `src/optimizer/diagnostics.ts` - Diagnostic emission functions, suppression directive parsing, declaration type classification
- `src/optimizer/types.ts` - Updated Diagnostic interface to match snapshot format (category, scope, flat highlights)
- `src/optimizer/transform.ts` - Wired C02/C05/preventdefault-passive-check detection and suppression filtering into pipeline
- `tests/optimizer/diagnostics.test.ts` - 22 tests covering unit and integration diagnostics
- `tests/optimizer/types.test.ts` - Updated for new Diagnostic shape

## Decisions Made
- Diagnostic type changed from `severity` to `category` and added `scope`/`suggestions` fields to match snapshot format exactly
- C02 detection parses each extraction body independently rather than sharing closureNodes map, avoiding symbolName collision issues
- C02 message uses "it's a function" for both function and class declarations (matching snapshot corpus behavior)
- C05 detection scans for exported $-suffixed names and checks for corresponding Qrl export presence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] C02 detection independent of captureNames**
- **Found during:** Task 2 (C02 pipeline integration)
- **Issue:** Plan assumed C02 would fire for items in captureNames, but fn/class declarations are NOT formal captures (they can't be serialized). The Rust optimizer emits C02 for referenced fn/class even when captures=false.
- **Fix:** C02 detection independently parses each extraction body with getUndeclaredIdentifiersInFunction() and classifies against enclosing scope, rather than relying on captureNames.
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 3db0b4e

**2. [Rule 1 - Bug] Extraction symbolName collisions in closureNodes map**
- **Found during:** Task 2 (C02 pipeline integration)
- **Issue:** Multiple extractions can have the same symbolName (e.g., nested $() inside component$()), causing closureNodes map to overwrite entries. C02 detection would miss some extractions.
- **Fix:** C02 detection parses each extraction's body text directly instead of relying on the shared closureNodes map.
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 3db0b4e

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 diagnostic codes functional through the transform pipeline
- Suppression directives working for per-line diagnostic suppression
- Ready for Plan 02 (snapshot convergence batch testing) and Plan 03 (final integration)

## Self-Check: PASSED
- FOUND: src/optimizer/diagnostics.ts
- FOUND: tests/optimizer/diagnostics.test.ts
- FOUND: e960fc5 (Task 1)
- FOUND: 3db0b4e (Task 2)

---
*Phase: 06-diagnostics-and-convergence*
*Completed: 2026-04-10*
