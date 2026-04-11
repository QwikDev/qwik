---
phase: 09-untransformed-extraction
plan: 03
subsystem: optimizer
tags: [inlinedQrl, qrl-declaration, captures, segment-extraction, parent-rewrite]

# Dependency graph
requires:
  - phase: 09-untransformed-extraction
    plan: 01
    provides: broadened marker detection for non-Qwik packages
provides:
  - inlinedQrl detection and extraction with explicit symbol names and capture arrays
  - Parent rewriting replacing inlinedQrl() with qrl()/qrlDEV() + .w() capture syntax
  - Segment codegen skipping useLexicalScope for inlinedQrl bodies (preserving _captures refs)
affects: [09-untransformed-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inlinedQrl symbol name parsed from string literal second argument, not context stack"
    - "Explicit capture arrays preserved in .w() calls including non-identifier values"
    - "qrlDEV used for inlinedQrl in lib/test mode on local files (not node_modules)"
    - "Snapshot parser preserves leading newlines for correct byte-offset positions"

key-files:
  created: []
  modified:
    - src/optimizer/extract.ts
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/rewrite-calls.ts
    - src/testing/snapshot-parser.ts
    - tests/optimizer/extract.test.ts

key-decisions:
  - "inlinedQrl symbol name from arg[1] determines hash: short names (task) use full name as hash; names with hash suffix (qwikifyQrl_component_zH94hIe0Ick) split at last underscore"
  - "inlinedQrl captures are explicit -- skip scope-based capture analysis and variable migration entirely"
  - "qrlDEV used for inlinedQrl in lib mode when file is not in node_modules (matches Rust Test mode behavior)"
  - "Snapshot parser changed from .trim() to .trimEnd() to preserve leading newlines that affect byte offsets in qrlDEV lo/hi"
  - "buildQrlDeclaration accepts optional segment extension for correct .mjs/.js suffix with explicitExtensions"

patterns-established:
  - "isInlinedQrl flag on ExtractionResult gates inlinedQrl-specific handling throughout pipeline"
  - "parseArrayItems helper for extracting capture items from source text arrays"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-04-11
---

# Phase 09 Plan 03: inlinedQrl Extraction and Parent Rewriting Summary

**Added inlinedQrl() detection extracting pre-processed QRL calls with explicit symbol names and capture arrays, replacing them with qrl()/qrlDEV() + .w() in parent modules**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-11T07:36:37Z
- **Completed:** 2026-04-11T07:56:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- inlinedQrl() calls detected and extracted as segments with symbol names from string literal args
- Parent modules correctly replace inlinedQrl(body, name, [captures]) with q_symbolName.w([captures])
- should_preserve_non_ident_explicit_captures convergence test now passes (34 total, up from 33)
- Non-identifier captures (true, false, numbers) preserved in .w() arrays but filtered from captureNames
- Segment bodies preserve _captures references without useLexicalScope injection

## Task Commits

Each task was committed atomically:

1. **Task 1: Add inlinedQrl detection and extraction in extract.ts** - `259087e` (feat)
2. **Task 2: Handle inlinedQrl parent rewriting with .w() capture syntax** - `04273d5` (feat)

## Files Created/Modified
- `src/optimizer/extract.ts` - Added isInlinedQrl, explicitCaptures, inlinedQrlNameArg fields; inlinedQrl detection in walk handler
- `src/optimizer/transform.ts` - Skip capture analysis and variable migration for inlinedQrl; skip useLexicalScope injection in segments
- `src/optimizer/rewrite-parent.ts` - Replace inlinedQrl calls with q_symbolName; .w() with explicit capture arrays; qrlDEV for local files in lib mode
- `src/optimizer/rewrite-calls.ts` - buildQrlDeclaration accepts optional segment extension for correct .mjs/.js suffix
- `src/testing/snapshot-parser.ts` - Preserve leading newlines in INPUT section for correct byte offsets
- `tests/optimizer/extract.test.ts` - Updated test fixtures with new ExtractionResult fields

## Decisions Made
- inlinedQrl symbol name is taken directly from the string literal second argument, not derived from context stack
- Hash is extracted from the symbol name: if last underscore segment is 8+ alphanumeric chars, it's the hash; otherwise the full name is the hash
- ctxName for top-level inlinedQrl uses the symbol name; for wrapped calls (componentQrl(inlinedQrl(...))), derives from the wrapper (component$)
- Capture analysis and variable migration completely skipped for inlinedQrl extractions since captures are explicit
- qrlDEV used for inlinedQrl in lib mode when the file path doesn't contain node_modules (matching Rust Test mode behavior)
- Segment extension used directly from source file (not body-based JSX detection) for inlinedQrl

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed snapshot parser trimming leading newlines**
- **Found during:** Task 2 (parent rewriting)
- **Issue:** Snapshot parser's .trim() on INPUT section removed leading newlines that the Rust optimizer includes in byte offsets for qrlDEV lo/hi values
- **Fix:** Changed .trim() to .trimEnd() and strip only the newline immediately after ==INPUT== marker
- **Files modified:** src/testing/snapshot-parser.ts
- **Verification:** qrlDEV lo/hi values now match expected (124/251 instead of 122/249)
- **Committed in:** 04273d5 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added segment extension to buildQrlDeclaration**
- **Found during:** Task 2 (parent rewriting for example_qwik_react)
- **Issue:** buildQrlDeclaration always used .js for explicit extensions, but .mjs files need .mjs extension in import paths
- **Fix:** Added optional segmentExtension parameter to buildQrlDeclaration, passed from all call sites
- **Files modified:** src/optimizer/rewrite-calls.ts, src/optimizer/rewrite-parent.ts, src/optimizer/transform.ts
- **Verification:** QRL declarations for .mjs files now use correct .mjs extension
- **Committed in:** 04273d5 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- example_qwik_react snapshot still fails due to pre-existing issues unrelated to inlinedQrl: JSX transpilation in segments (missing _jsxSorted), import rewriting (@builder.io not converted to @qwik.dev in origin), variable migration (_auto_filterProps), and surviving Qwik imports that should be removed. These require fixes in other subsystems (JSX transform, import rewriting, variable migration) and are out of scope for this plan.

## Next Phase Readiness
- inlinedQrl detection and extraction fully implemented for both simple and complex cases
- should_preserve_non_ident_explicit_captures passes (1 of 2 target snapshots)
- example_qwik_react needs additional subsystem fixes beyond inlinedQrl to pass
- 34 convergence tests passing (up from 33), zero regressions
- 511 unit tests passing, zero regressions

---
*Phase: 09-untransformed-extraction*
*Completed: 2026-04-11*
