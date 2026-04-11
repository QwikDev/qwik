---
phase: 07-parent-rewrite-batch-1
plan: 04
subsystem: optimizer
tags: [inline-strategy, jsx-transpilation, parent-rewrite, qwik-optimizer]

# Dependency graph
requires:
  - phase: 07-parent-rewrite-batch-1
    plan: 03
    provides: Unused binding removal, Qwik import preservation, inline migration skip
provides:
  - JSX transpilation within inline .s() body text via re-parse and transformAllJsx
  - Child JSX element null-key optimization matching Rust optimizer
  - JSX whitespace preservation between expression siblings
affects: [parent-rewrite-batch-2, convergence-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Body JSX transpilation: wrap body as parseable module, re-parse with oxc-parser, run transformAllJsx, strip wrapper prefix"
    - "QRL variable names added to importedNames for correct const prop classification in body context"
    - "Child JSX null-key: WeakSet tracks JSX children of parent elements, assigns null key instead of u6_N counter"
    - "Whitespace preservation: JSXText between non-text siblings preserved as single space string"

key-files:
  created: []
  modified:
    - src/optimizer/rewrite-parent.ts
    - src/optimizer/jsx-transform.ts

key-decisions:
  - "Body JSX transform uses wrap-parse-transform-unwrap pattern: const __body__ = <body> parsed as module, transformed, wrapper stripped"
  - "Child JSX elements get null keys matching Rust optimizer behavior: only root-level elements get u6_N keys"
  - "QRL variable names treated as imported/const in body JSX context for correct prop classification"
  - "Remaining 6 target snapshots blocked by pre-existing issues: symbol naming (Cmp_p context), inlinedQrl vs _noopQrl format, _wrapProp in children"

patterns-established:
  - "Body JSX transpilation via SCallBodyJsxOptions parameter to transformSCallBody"
  - "Child key null pattern: any JSX element/fragment that is a child of another JSX element/fragment gets null key"

requirements-completed: []

# Metrics
duration: 14min
completed: 2026-04-11
---

# Phase 07 Plan 04: Inline .s() Body JSX Transpilation Summary

**JSX transpilation applied to inline-strategy .s() body text via re-parse and transformAllJsx, with child-key null optimization and whitespace preservation**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-11T04:01:49Z
- **Completed:** 2026-04-11T04:16:29Z
- **Tasks:** 1 of 1
- **Files modified:** 2

## Accomplishments
- Implemented JSX transpilation within inline .s() body text: bodies now contain _jsxSorted calls instead of raw JSX
- Added SCallBodyJsxOptions to transformSCallBody with gate condition on jsxOptions.enableJsx
- QRL variable names augmented into importedNames set for correct const prop classification
- Hoisted signal declarations from body transforms collected and merged into parent preamble
- Fixed child JSX key generation: child elements/fragments get null key (not u6_N), matching Rust optimizer
- Fixed JSX whitespace: space-only text between expression siblings preserved as " " string
- 20 convergence tests passing (was 19), zero unit test regressions (473 passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement JSX transpilation in inline .s() body text** - `816e9e8` (feat)

## Files Created/Modified
- `src/optimizer/rewrite-parent.ts` - Added SCallBodyJsxOptions interface, extended transformSCallBody with JSX re-parse-transform pipeline, updated Step 5c call sites to pass jsxBodyOptions and collect hoistedDeclarations, added inlineHoistedDeclarations to preamble assembly
- `src/optimizer/jsx-transform.ts` - Added isSoleChild parameter to transformJsxElement and transformJsxFragment for null-key assignment, added childJsxNodes WeakSet tracking in transformAllJsx enter phase, fixed processChildren whitespace preservation between expression siblings

## Decisions Made
- **Wrap-parse-transform-unwrap pattern**: Body text wrapped as `const __body__ = <body>` for valid module-level parsing by oxc-parser, then wrapper prefix stripped after transform. This avoids needing a separate expression parser.
- **Child key null optimization**: All JSX elements/fragments that are direct children of another JSX element/fragment get null key. Only root-level elements get generated u6_N keys. This matches Rust optimizer behavior where children don't need unique keys for reconciliation within their parent scope.
- **QRL var names as const**: QRL variable names (q_symbolName) added to importedNames when transforming body JSX so classifyProp treats them as const (they're module-level const declarations).

## Deviations from Plan

### 1 of 7 target snapshots passes (plan expected 5+)

**[Rule 4 - Architectural] Remaining 6 snapshots blocked by pre-existing issues outside this plan's scope**

- **Found during:** Task 1 verification
- **Issue:** The 6 remaining target snapshots fail due to pre-existing issues that are NOT related to JSX transpilation within body text:
  1. **Symbol naming** (example_dev_mode_inlined, example_preserve_filenames): Event handler extractions inside component children get `p_q_e_click` context instead of `Cmp_p_q_e_click`. This is a context stack issue in the extraction pipeline.
  2. **inlinedQrl vs _noopQrl format** (example_lib_mode): The expected output uses `inlinedQrl()` inline calls instead of `_noopQrl + .s()` format. This is a different inline strategy output format not yet implemented.
  3. **Pre-transpiled input** (example_parsed_inlined_qrls): Input is already transpiled code with `componentQrl/inlinedQrl/jsx/jsxs` calls that needs re-processing into `_noopQrl + .s()` format. Requires different transformation pipeline.
  4. **Signal wrapping in children** (example_input_bind): `value.value` in JSX children should become `_wrapProp(value)`. The JSX transform only processes signals in props, not in children position.
  5. **Complex features** (example_props_optimization): Needs destructuring optimization (_rawProps pattern), _jsxSplit support, and additional signal analysis.
- **Impact:** The core JSX transpilation mechanism works correctly (proven by example_optimization_issue_3795 passing). Remaining failures require extraction pipeline, entry strategy format, and signal analysis changes.

### Auto-fixed issues

**1. [Rule 1 - Bug] Fixed child JSX key generation**
- **Found during:** Task 1 implementation
- **Issue:** All JSX elements got u6_N keys, but the Rust optimizer assigns null keys to child elements
- **Fix:** Added childJsxNodes WeakSet to track children, pass isSoleChild flag to transformJsxElement/transformJsxFragment
- **Files modified:** src/optimizer/jsx-transform.ts
- **Commit:** 816e9e8

**2. [Rule 1 - Bug] Fixed JSX whitespace between expression siblings**
- **Found during:** Task 1 testing example_optimization_issue_3795
- **Issue:** Space-only JSXText between expression containers (e.g., `{a} {b}`) was dropped, losing the " " separator
- **Fix:** processChildren now preserves whitespace-only text between non-text siblings as " " string
- **Files modified:** src/optimizer/jsx-transform.ts
- **Commit:** 816e9e8

---

**Total deviations:** 3 (1 scope limitation, 2 auto-fixed bugs)
**Impact on plan:** Core JSX transpilation mechanism implemented and working. 1 of 7 target snapshots passes. Remaining 6 require changes to extraction pipeline, entry strategy output format, and signal analysis -- all pre-existing architectural issues.

## Known Stubs
None - all functionality is fully wired.

## Issues Encountered
- Most inline-strategy snapshots combine JSX transpilation with other features (symbol naming context, inlinedQrl format, signal wrapping in children, destructuring) that cannot be addressed by JSX body transpilation alone.
- The child null-key fix is a general JSX transform improvement that benefits all JSX processing, not just inline bodies.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 20/210 convergence tests passing (was 19)
- JSX body transpilation infrastructure complete for inline strategy
- Remaining parent output issues require: context stack fix for component child event naming, inlinedQrl inline format support, signal wrapping in children position, destructuring optimization

---
*Phase: 07-parent-rewrite-batch-1*
*Completed: 2026-04-11*
