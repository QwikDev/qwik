---
phase: 14-segment-codegen-batch-2
plan: 02
subsystem: optimizer
tags: [segment-codegen, enum-transpilation, rawProps, restProps, diagnostic-comments, auto-reexport]

requires:
  - phase: 14-segment-codegen-batch-2
    provides: Nested call rewriting foundation from Plan 01

provides:
  - TS enum value inlining in segment bodies (Thing.A -> 0)
  - Parent enum let-to-var post-processing for Rust output parity
  - _restProps transform for pure and mixed rest-props destructuring
  - Diagnostic comment stripping from segment bodies
  - Correct _auto_ re-export suppression for already-exported variables

affects: [14-segment-codegen-batch-2, segment-codegen]

tech-stack:
  added: []
  patterns:
    - "Enum value map collected from parent AST, passed to segment codegen for member reference inlining"
    - "injectLineAfterBodyOpen helper for inserting declarations into arrow/function bodies"
    - "isExported flag on migration decisions distinguishes _auto_ prefix need"

key-files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts
    - src/optimizer/rewrite-parent.ts

key-decisions:
  - "Enum value inlining uses map-based replacement in segment bodies rather than running oxc-transform on full file before extraction (avoids position shifting)"
  - "Parent let-to-var for enum IIFEs uses regex post-processing after oxcTransformSync"
  - "Already-exported variables skip _auto_ prefix -- segments import them directly by original name"
  - "_restProps import added inline in segment-codegen when _rawProps transform introduces it"

patterns-established:
  - "enumValueMap: Map<string, Map<string, string>> passed from transform.ts to generateSegmentCode for TS enum member inlining"
  - "injectLineAfterBodyOpen for inserting _restProps declarations after arrow function body opening"

requirements-completed: [P14-02, P14-03]

duration: 12min
completed: 2026-04-11
---

# Phase 14 Plan 02: TS Enum Transpilation, Rest-Props, and Auto-Export Fixes Summary

**TS enum member references inlined to literal values in segments, _restProps transform for rest-props destructuring, diagnostic comment stripping, and _auto_ re-export suppression for exported variables**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-11T13:24:10Z
- **Completed:** 2026-04-11T13:37:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- TS enum member references (Thing.A) resolved to literal values (0) in segment bodies when transpileTs is enabled
- Parent module enum declarations use var (not let) matching Rust optimizer output after oxc-transform
- _rawProps transform extended for pure rest-props ({...rest}) and mixed rest-props ({a, b, ...rest}) patterns
- Diagnostic comments (@qwik-disable-next-line) stripped from segment bodies
- Already-exported variables no longer get _auto_ prefix in segment imports -- imported directly by original name

## Task Commits

Each task was committed atomically:

1. **Task 1: TS enum transpilation in segment bodies and parent let-to-var fix** - `0026dc1` (feat)
2. **Task 2: Extend _rawProps for rest-props, fix _auto_ re-exports, and verify** - `a9ddfc6` (feat)

## Files Created/Modified

- `src/optimizer/segment-codegen.ts` - Added enumValueMap parameter, enum value inlining, diagnostic comment stripping, _restProps import injection
- `src/optimizer/transform.ts` - Enum declaration collection from parent AST, isExported flag on migration decisions, skip _auto_ for exported variables
- `src/optimizer/rewrite-parent.ts` - injectLineAfterBodyOpen helper, rest-props handling in applyRawPropsTransform, let-to-var post-processing for enum IIFEs

## Decisions Made

- Used map-based enum value replacement in segment bodies rather than running full-file TS transpilation before extraction (Strategy B from plan) -- avoids position shifting that would break magic-string operations
- Parent let-to-var uses targeted regex `let X = function(X)` -> `var X = function(X)` after oxc-transform runs
- The _auto_ prefix bypass checks `isExported` from moduleLevelDecls -- already-exported variables don't need synthetic re-export prefixes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed offset variable ordering in applyRawPropsTransform**
- **Found during:** Task 2
- **Issue:** New rest-props code used `offset` variable before its declaration (ReferenceError)
- **Fix:** Moved `const offset = wrapperPrefix.length` declaration before rest-props blocks
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Committed in:** a9ddfc6

**2. [Rule 2 - Missing Critical] Added _restProps import injection in segment codegen**
- **Found during:** Task 2
- **Issue:** _rawProps transform introduces _restProps() calls but no import was being added
- **Fix:** After applyRawPropsTransform, check if _restProps( is in body and add import from @qwik.dev/core
- **Files modified:** src/optimizer/segment-codegen.ts
- **Committed in:** a9ddfc6

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- Convergence count remains at 51/210 -- the enum, rest-props, and _auto_ fixes produce correct segment output (verified via debug comparison), but pre-existing JSX flags differences (1 vs 3) and parent module mismatches in those same snapshots prevent them from flipping to fully passing
- The fixes are infrastructure improvements that will combine with future JSX and parent fixes to unlock additional passing snapshots

## Next Phase Readiness

- Enum transpilation, rest-props, and _auto_ fixes complete
- Plan 14-03 can build on these foundations
- Pre-existing JSX flags issue (1 vs 3 in some segments) is a separate concern for future phases

---
*Phase: 14-segment-codegen-batch-2*
*Completed: 2026-04-11*
