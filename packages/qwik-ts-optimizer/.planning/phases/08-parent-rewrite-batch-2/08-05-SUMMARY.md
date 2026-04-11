---
phase: 08-parent-rewrite-batch-2
plan: 05
subsystem: optimizer
tags: [ast-compare, jsx-context, ts-stripping, display-name, convergence]

requires:
  - phase: 08-parent-rewrite-batch-2
    plan: 01
    provides: "TS stripping and capture suppression"
  - phase: 08-parent-rewrite-batch-2
    plan: 02
    provides: "Variable migration and unused binding removal"
  - phase: 08-parent-rewrite-batch-2
    plan: 03
    provides: "Signal wrapping for children and _rawProps"
  - phase: 08-parent-rewrite-batch-2
    plan: 04
    provides: "regCtxName/_regSymbol support"
provides:
  - "JSXElement context path fix for correct display name generation"
  - "JSX preserve during TS stripping when transpileJsx=false"
  - "AST comparison normalization for single-statement control flow blocks"
  - "Component vs HTML element event handler naming distinction"
  - "Dev mode lo/hi byte offset correction for _noopQrlDEV"
affects: [08-parent-rewrite-batch-2]

tech-stack:
  added: []
  patterns:
    - "JSXElement (not JSXOpeningElement) push for context stack: ensures child elements inherit parent tag name in display name path"
    - "jsx:'preserve' option for oxc-transform: strips TS types without transpiling JSX"
    - "Component element detection: uppercase first char of JSXOpeningElement tag distinguishes component from HTML element for event handler naming"
    - "BlockStatement normalization in AST compare: single-statement blocks treated as equivalent to bare statements"

key-files:
  created: []
  modified:
    - src/optimizer/extract.ts
    - src/optimizer/rewrite-parent.ts
    - src/testing/ast-compare.ts
    - tests/optimizer/snapshot-options.ts

key-decisions:
  - "JSX tag name context pushed on JSXElement enter instead of JSXOpeningElement enter -- JSXOpeningElement is sibling to children, not ancestor, so pushing there causes premature pop before child elements are processed"
  - "Component elements (uppercase tag) keep untransformed event handler name (onClick) in display name; HTML elements use transformed name (q_e_click)"
  - "oxc-transform jsx:'preserve' option used when transpileJsx=false to strip TS types without transpiling JSX syntax"
  - "AST comparison normalizes single-statement BlockStatement in control flow bodies (if/for/while) to match bare statement form"
  - "regCtxName-matched extractions use inline .s() pattern when entryType is 'inline' (even if auto-promoted to hoist)"

patterns-established:
  - "JSXElement context push: push tag name on JSXElement node so all children (including nested JSX and attributes) inherit the context"
  - "jsx:'preserve' for TS-only stripping: pass jsx:'preserve' to oxc-transform when only TS types need stripping"

requirements-completed: [SC-1, SC-2, SC-3]

duration: 21min
completed: 2026-04-11
---

# Phase 08 Plan 05: Final Sweep -- JSX Context Path, TS Preserve, AST Normalization Summary

**Fixed JSXElement context path for display names, added JSX preserve during TS stripping, and normalized AST comparison for control flow blocks, reaching 32 convergence tests (12/24 Phase 8 targets)**

## Performance

- **Duration:** 21 min
- **Started:** 2026-04-11T05:56:57Z
- **Completed:** 2026-04-11T06:17:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Fixed JSXElement context path: display names now include parent JSX element names (e.g., App_component_Cmp_p_q_e_click instead of App_component_p_q_e_click)
- Added JSX preserve mode for TS stripping: when transpileJsx=false, oxc-transform strips only TS types while preserving JSX syntax
- Normalized AST comparison for single-statement control flow blocks: `if (x) y++` now matches `if (x) { y++ }` semantically
- Distinguished component vs HTML element event handler naming in display name context
- Convergence from 29 to 32 tests passing (3 net gain, plus 1 bonus non-target)

## Task Commits

1. **Task 1: Fix remaining Phase 8 snapshot failures** - `41beb49` (feat)

## Files Created/Modified

- `src/optimizer/extract.ts` - Moved JSX tag context push from JSXOpeningElement to JSXElement; added component vs HTML element naming distinction for event handler attributes
- `src/optimizer/rewrite-parent.ts` - Added jsx:'preserve' for TS stripping when transpileJsx=false; regCtxName inline .s() pattern for auto-promoted hoist; dev mode lo/hi uses argStart/argEnd
- `src/testing/ast-compare.ts` - Added BlockStatement normalization for single-statement control flow bodies
- `tests/optimizer/snapshot-options.ts` - Fixed root_level_self_referential_qrl_inline options (mode:'dev', filename)

## Decisions Made

- JSXElement context push: The root cause of missing element names in display paths was that JSXOpeningElement is a sibling of children in the AST, not their ancestor. Pushing the tag name on JSXElement enter ensures it stays on the stack for all descendants.
- Component event naming: The Rust optimizer uses untransformed event names (onClick) for component elements and transformed names (q_e_click) for HTML elements. Detection uses uppercase first character of the tag name.
- JSX preserve: oxc-transform's jsx:'preserve' option was discovered to strip TS types without transpiling JSX, solving the transpileTs=true + transpileJsx=false combination.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSXOpeningElement context push timing**
- **Found during:** Task 1
- **Issue:** JSX tag names were pushed on JSXOpeningElement enter and popped on leave, but JSXOpeningElement is a sibling of JSXElement's children, not their ancestor. By the time child elements were processed, the parent tag name had already been popped.
- **Fix:** Moved the push to JSXElement enter, which is the actual ancestor of both the opening element and children.
- **Files modified:** src/optimizer/extract.ts
- **Commit:** 41beb49

**2. [Rule 1 - Bug] Fixed JSX transpilation during TS-only stripping**
- **Found during:** Task 1
- **Issue:** When transpileTs=true but transpileJsx=false, oxc-transform with 'output.tsx' filename would transpile JSX along with stripping types. Tests like example_transpile_ts_only expected preserved JSX.
- **Fix:** Pass jsx:'preserve' option to oxcTransformSync when jsxOptions is not enabled.
- **Files modified:** src/optimizer/rewrite-parent.ts
- **Commit:** 41beb49

**3. [Rule 2 - Missing] Added component element event handler naming distinction**
- **Found during:** Task 1
- **Issue:** All event handler attributes used transformed naming (q_e_click) regardless of whether the parent element was a component or HTML element. Rust optimizer uses untransformed names for components.
- **Fix:** Check parent JSXOpeningElement tag name; uppercase = component = untransformed name.
- **Files modified:** src/optimizer/extract.ts
- **Commit:** 41beb49

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All fixes addressed root causes of display name mismatches and JSX transpilation issues.

## Issues Encountered

- The remaining 12 Phase 8 targets that still fail require deeper architectural changes not achievable in this sweep:
  - **Prop classification** (4 example_props_wrapping variants): _rawProps transform, _fnSignal parameter ordering, const/var prop bucket assignment
  - **regCtxName const inlining** (3 reg_ctx_name variants): captured const values not inlined into extraction body, hoist vs inline strategy selection
  - **Side-effect import preservation** (example_strip_client_code): relative imports should be converted to side-effect imports when specifiers become unused
  - **Destructuring optimization** (example_use_optimization): store destructuring chains should be flattened to single member access
  - **Complex multi-component scoping** (fun_with_scopes): requires _getVarProps/_getConstProps/_jsxSplit generation, hoisted function ordering
  - **Inline strategy selection** (example_qwik_react_inline, root_level_self_referential_qrl_inline): entry strategy not correctly applying _noopQrl+.s() pattern for certain file types/configs
  - **_rawProps/captures naming** (should_not_generate_conflicting_props_identifiers): capture param renaming to avoid conflicts with destructured prop names

## Known Stubs

None -- all functionality added is complete and producing correct output for the tests it fixes.

## Deferred Issues

The 12 remaining Phase 8 targets have been documented above. Key deferred items:
- Prop classification const/var bucket assignment for _rawProps components
- Side-effect import preservation heuristic for stripped segments
- Store destructuring chain optimization (use optimization)
- Complex _jsxSplit generation for spread props with component elements

## Next Phase Readiness

- 32 convergence tests passing (12/24 Phase 8 targets)
- 473 unit tests passing (zero regressions)
- TypeScript compilation clean (only pre-existing diag.ts errors)
- JSXElement context path fix is foundational and will benefit future convergence work
- The remaining Phase 8 targets require targeted feature implementations in future phases

---
*Phase: 08-parent-rewrite-batch-2*
*Completed: 2026-04-11*

## Self-Check: PASSED
