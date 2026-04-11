---
phase: 13-segment-codegen-batch-1
plan: 03
subsystem: optimizer
tags: [segment-codegen, jsx-transform, event-extraction, import-attributes, convergence]

requires:
  - phase: 13-segment-codegen-batch-1
    provides: "Segment body transforms and post-transform import re-collection"
provides:
  - "JSX $-attr extraction from non-component functions (event handlers in lightweight components)"
  - "className -> class conversion for HTML elements in JSX transform"
  - "Whitespace-only JSX text node stripping"
  - "Import attributes (with { type: 'json' }) in segment import generation"
  - "Correct // separator placement between QRL declarations and body"
  - "Always-run removeUnusedImports for segments with JSXIdentifier detection"
affects: [segment-codegen, jsx-transform]

tech-stack:
  added: []
  patterns: ["unconditional JSX $-attr extraction", "post-DCE import cleanup", "JSXIdentifier-aware import analysis"]

key-files:
  created: []
  modified:
    - src/optimizer/extract.ts
    - src/optimizer/jsx-transform.ts
    - src/optimizer/rewrite-calls.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts

key-decisions:
  - "JSX $-attr extraction gate removed: markerCallDepth > 0 no longer required, enabling event handler extraction from any JSX context"
  - "className -> class only for HTML elements (tagIsHtml=true), component elements keep className"
  - "removeUnusedImports runs unconditionally for all segments after dead code elimination"
  - "QRL import paths always use .js when explicitExtensions enabled, regardless of source extension"

patterns-established:
  - "Segment post-processing order: codegen -> TS strip -> dead code elimination -> unused import removal"
  - "Two-separator layout in segment code: [imports] // [qrl-decls] // [body]"

requirements-completed: []

duration: 23min
completed: 2026-04-11
---

# Phase 13 Plan 03: Missing Segments and Codegen Convergence Summary

**JSX $-attr extraction ungated for lightweight functional components, className/class conversion, whitespace stripping, import attributes, and segment codegen fixes -- 4 new convergence tests passing (45 -> 49) with zero regressions**

## Performance

- **Duration:** 23 min
- **Started:** 2026-04-11T12:33:03Z
- **Completed:** 2026-04-11T12:56:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed markerCallDepth > 0 gate on JSX $-attr extraction, enabling event handler extraction from non-component functions (lightweight functional components, default export functions)
- Added className -> class conversion for HTML elements in JSX transform while preserving className for component elements
- Stripped whitespace-only JSX text nodes between siblings to match Rust optimizer output
- Fixed QRL import path extension to always use .js when explicitExtensions is enabled
- Moved removeUnusedImports to run after dead code elimination and unconditionally for all segments
- Added JSXIdentifier detection to removeUnusedImports to prevent incorrect removal of JSX component imports
- Added import attributes (with { type: "json" }) support to segment initial import generation
- Fixed // separator placement to correctly separate QRL declarations from export body
- 4 new Phase 13 convergence tests passing: example_dead_code, example_import_assertion, example_jsx_keyed, should_transform_two_handlers_capturing_different_block_scope_in_loop
- 49 total convergence tests passing (from 45 baseline), zero regressions in unit tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix missing segments and remaining codegen issues** - `04cdad4` (feat)

## Files Created/Modified
- `src/optimizer/extract.ts` - Removed markerCallDepth gate on JSX $-attr extraction
- `src/optimizer/jsx-transform.ts` - Added className -> class for HTML elements, stripped whitespace text nodes
- `src/optimizer/rewrite-calls.ts` - Fixed QRL import path to always use .js with explicitExtensions
- `src/optimizer/segment-codegen.ts` - Added import attributes to initial imports, fixed // separator layout
- `src/optimizer/transform.ts` - Moved removeUnusedImports after DCE, added JSXIdentifier detection, runs unconditionally

## Decisions Made
- JSX $-attr extraction is now unconditional (no markerCallDepth gate) matching Rust optimizer behavior that extracts event handlers from any function with JSX, not just marker call scopes
- className -> class conversion gated on tagIsHtml to match Rust optimizer's different handling of HTML vs component elements
- removeUnusedImports must run after dead code elimination (if(false) stripping) to correctly remove imports that become unreferenced
- QRL import paths always use .js regardless of source file extension when explicitExtensions is enabled

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSXIdentifier not detected by removeUnusedImports**
- **Found during:** Task 1
- **Issue:** removeUnusedImports only checked Identifier nodes, not JSXIdentifier nodes, causing JSX component imports to be incorrectly removed
- **Fix:** Added JSXIdentifier to the node type check in the AST walker
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 04cdad4

**2. [Rule 1 - Bug] removeUnusedImports running before dead code elimination**
- **Found during:** Task 1
- **Issue:** Import cleanup ran before if(false) block stripping, so dead-code-only imports survived
- **Fix:** Reordered pipeline: TS strip -> DCE -> removeUnusedImports
- **Files modified:** src/optimizer/transform.ts
- **Committed in:** 04cdad4

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct segment import output. No scope creep.

## Issues Encountered
- 21 of 25 Phase 13 target snapshots still fail due to deep issues in JSX prop classification (varProps vs constProps for event handlers), nested call rewriting (useAsync$ -> useAsyncQrl wrapping), _rawProps transform for non-component extractions, variable migration (_auto_ prefix), dev mode identity for index files, segment body declaration stripping, _qrlSync serialization, and self-referential component inline QRL generation. These are pre-existing gaps in the optimizer pipeline that require dedicated phases to address.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None -- all changes are functional with no placeholder data.

## Next Phase Readiness
- 49 convergence tests passing as new baseline (4 above prior 45)
- Remaining 21 Phase 13 targets require deeper pipeline fixes in JSX prop classification, nested call rewriting, capture computation for non-component extractions, and variable migration
- All pre-existing unit tests still pass (530 unit tests green)

## Self-Check: PASSED

---
*Phase: 13-segment-codegen-batch-1*
*Completed: 2026-04-11*
