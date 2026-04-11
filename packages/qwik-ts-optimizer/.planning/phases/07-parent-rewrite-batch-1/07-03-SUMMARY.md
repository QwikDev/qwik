---
phase: 07-parent-rewrite-batch-1
plan: 03
subsystem: optimizer
tags: [parent-rewrite, import-preservation, variable-binding, display-name, qwik-optimizer]

# Dependency graph
requires:
  - phase: 07-parent-rewrite-batch-1
    plan: 02
    provides: .s() body transformation, import order normalization
provides:
  - Unused variable binding removal for non-exported QRL call sites
  - Qwik user import preservation with non-$-suffixed specifier detection
  - Index file display name derivation from parent directory
  - Inline strategy variable migration skip
affects: [parent-rewrite-batch-2, convergence-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unused binding removal: scan VariableDeclarations containing nested extraction call sites, strip when var unused and not exported"
    - "Qwik import preservation: single-quoted imports with non-$-suffixed specifiers preserve all specifiers including markers"
    - "Index file naming: getFileStem returns directory name for index.* files, skips default export push"

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/transform.ts
    - src/optimizer/extract.ts

key-decisions:
  - "Unused binding removal only for nested extractions (call site inside init, not the init itself) to avoid stripping named marker calls like componentQrl"
  - "Qwik import preservation uses quote style (single=user, double=optimizer) plus non-$-suffixed specifier check as discriminator"
  - "Skip variable migration entirely for inline/hoist strategy since segments share parent module scope"
  - "example_missing_custom_inlined_functions deferred: requires aliased import resolution in extraction pipeline"

patterns-established:
  - "Quote-based import origin detection: single quotes indicate user-written imports, double quotes indicate optimizer-added"
  - "Index file naming: directory name replaces 'index' stem, no extension appended"

requirements-completed: []

# Metrics
duration: 19min
completed: 2026-04-11
---

# Phase 07 Plan 03: Gap Closure Fixes Summary

**Targeted parent output fixes for unused binding removal, Qwik import preservation, index file naming, and inline migration skip -- 3 new convergence tests passing**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-11T03:39:25Z
- **Completed:** 2026-04-11T03:59:02Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments
- Unused variable bindings wrapping QRL call sites stripped when variable is not exported and not referenced elsewhere (example_1)
- Qwik user imports preserved with all original specifiers when import has non-$-suffixed identifiers (example_functional_component)
- Index file display names derived from parent directory name instead of "index" (example_default_export_index)
- Variable migration skipped for inline/hoist strategy since segments share parent module scope
- 19 convergence tests passing (was 16), zero unit test regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix segment-strategy parent output issues** - `2377c07` (feat)
2. **Task 2: Fix inline-strategy minor issues** - `bf482ec` (feat)

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Step 4a unused binding removal, Qwik import preservation with preserveAll logic
- `src/optimizer/transform.ts` - removeUnusedImports Qwik specifier preservation, inline strategy migration skip
- `src/optimizer/extract.ts` - getFileStem index file detection, isIndex flag for default export push skip

## Decisions Made
- **Unused binding removal scope**: Only strips bindings when the extraction's call site is NESTED inside the VariableDeclarator init (not when the init IS the extraction). This preserves `const Header = componentQrl(q_...)` while stripping `const renderHeader2 = component(q_...)`.
- **Import preservation discriminator**: Uses two checks: (1) single quotes in Step 1+2 to identify user imports, (2) presence of non-$-suffixed specifiers to determine whether to preserve all specifiers including markers.
- **Inline migration skip**: Empty migration decisions array for inline/hoist strategy. This prevents `_auto_` re-exports and `move` actions that don't apply when segments share the parent module scope.
- **example_missing_custom_inlined_functions deferred**: This snapshot uses aliased imports (`component$ as Component`, `$ as onRender`) but the source code references `component$` and `$` directly (undeclared). The Rust optimizer doesn't extract these, but our extractor does because it matches by name pattern. Fixing requires changes to the core extraction pipeline's import resolution.

## Deviations from Plan

### Task 1: 2 of 3 target snapshots fixed

**[Rule 4 - Architectural] example_missing_custom_inlined_functions requires extraction pipeline changes**
- **Found during:** Task 1 analysis
- **Issue:** The snapshot uses aliased Qwik imports where the source code references the original import names (not the aliases). Our extractor detects `component$` and `$` as markers by name pattern, but the Rust optimizer doesn't extract because the local names (`Component`, `onRender`) don't match. Signal wrapping inside non-extracted `$()` callbacks is also needed.
- **Decision:** Defer to future plan. This requires changes to how `isMarkerCall` resolves import aliases, which is core extraction logic beyond this plan's scope.
- **Impact:** 2 of 3 Task 1 targets pass instead of 3.

### Task 2: 1 of 3 target snapshots fixed

**[Rule 4 - Architectural] example_optimization_issue_4386 requires .s() call placement ordering**
- **Found during:** Task 2 analysis
- **Issue:** The `.s()` calls are emitted in the preamble (before body), but the expected output places them after module-level declarations they reference (like `FOO_MAPPING`). Additionally, the Rust optimizer simplifies the `.s()` body by constant-folding (`const key = 'A'; FOO_MAPPING[key]` becomes `FOO_MAPPING['A']`).
- **Decision:** Migration skip fixes `_auto_` issue but `.s()` placement requires rearchitecting preamble assembly. Defer.

**[Rule 4 - Architectural] example_optimization_issue_3542 requires _rawProps destructuring optimization**
- **Found during:** Task 2 analysis
- **Issue:** The Rust optimizer transforms destructured component parameters (`{ctx, atom}`) into `_rawProps` with property access rewrites. This is a significant feature addition requiring parameter pattern detection and body text transformation.
- **Decision:** Defer to future plan as noted in plan text ("most complex fix").

---

**Total deviations:** 3 (all architectural scope issues deferred)
**Impact on plan:** 3 of 6 target snapshots fixed (19 total passing, was 16). Remaining 3 require deeper architectural work.

## Issues Encountered
- Qwik import preservation behavior varies across snapshots and correlates with `minify` option. Single-quote + non-$-specifier heuristic handles all known cases.
- Unused binding removal had a subtle case: `component$(() => ...)` creates a direct extraction (init IS the call), while `component($(() => ...))` creates a nested extraction inside a non-marker wrapper. Only the nested case should strip bindings.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 19/209 convergence tests passing
- Remaining parent output issues require: .s() call placement, body simplification, extraction alias resolution, _rawProps optimization
- Ready for Phase 07 Plan 04

---
*Phase: 07-parent-rewrite-batch-1*
*Completed: 2026-04-11*
