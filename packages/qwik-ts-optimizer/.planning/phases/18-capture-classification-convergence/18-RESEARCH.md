# Phase 18: Capture Classification Convergence - Research

**Researched:** 2026-04-11
**Domain:** Capture analysis, paramNames/captureNames classification, .w() hoisting, q:p/q:ps injection
**Confidence:** HIGH

## Summary

Phase 18 fixes how captured variables are delivered to extracted segments. The SWC optimizer uses two distinct delivery mechanisms: (1) function parameters with positional padding for loop-local and component-scope captures, and (2) `_captures` array access combined with `.w()` wrapping for cross-scope captures. The current TS implementation has the basic infrastructure but produces mismatched output in three areas: paramNames padding/slot unification, captureNames ordering, and .w() hoisting placement in segment bodies.

Analysis of 13+ capture-related failing snapshots reveals the root causes are concentrated in `transform.ts` (capture classification logic around lines 1080-1400), `segment-codegen.ts` (.w() declaration injection and _captures unpacking), and `rewrite-parent.ts` (.w() wrapping on QRL references). The SWC reference in `transform.rs` lines 1300-1470 and `code_move.rs` lines 100-200 provides the authoritative behavioral rules.

**Primary recommendation:** Fix capture classification in three waves: (1) paramNames slot unification for multi-handler elements, (2) cross-scope capture ordering and _captures injection, (3) .w() hoisting placement in segment body codegen.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Loop-local variables delivered via function parameters with correct `paramNames` padding, verified by snapshot AST comparison | paramNames padding and unified slot allocation logic in transform.ts; SWC uses alphabetically sorted q:ps with positional _ padding |
| CAP-02 | Cross-scope captures delivered via `._captures` + `.w()` hoisting, verified by snapshot AST comparison | _captures injection in segment-codegen.ts; .w() hoisting in rewrite-parent.ts and segment-codegen.ts componentScopeWDecls |
| CAP-03 | Segment metadata (`captures`, `captureNames`, `paramNames`) matches snapshot expected metadata | Convergence test compares `captures` boolean and segment code AST (which embeds paramNames in function signature and captureNames in _captures unpacking) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Parser/AST:** oxc-parser, oxc-walker, magic-string only -- no Babel
- **Hashing:** siphash for SipHash-1-3 with keys (0,0) -- must match SWC
- **Testing:** vitest -- test runner for all tests
- **Codegen:** magic-string surgical edits, not full AST reprint
- **Runtime correctness:** Output must be runtime-identical to SWC optimizer
- **SWC reference:** Read-only behavioral reference, not reimplementation target

## Architecture Patterns

### Current Capture Classification Flow

```
transform.ts (lines 1030-1400)
  |
  +-- Step 2a: For each extraction, collect undeclared identifiers
  |   via oxc-walker getUndeclaredIdentifiersInFunction()
  |
  +-- Build allScopeIds from enclosing scopes, intermediate functions
  |
  +-- Filter undeclared against scope ids and imports
  |
  +-- Partition into loop-local vs cross-scope:
  |     - NOT in loop: ALL captures -> paramNames with [_, _1, ...vars]
  |     - IN loop: loop-local vars -> paramNames, cross-scope -> captureNames
  |
  +-- Step 2a-slots: Unify parameter slots for multi-handler elements
  |
  +-- Step 2b: Build q:ps arrays from unified param slots
```

### Segment Code Generation Flow (segment-codegen.ts)

```
generateSegmentCode()
  |
  +-- Build imports (including _captures if captureNames > 0)
  |
  +-- Process nested call sites:
  |     - JSX attr replacements (event handlers -> q-e:click etc.)
  |     - .w() hoisting declarations (loop-scope and component-scope)
  |     - Bare $() replacements with optional .w()
  |
  +-- Inject _captures unpacking (if captureNames > 0)
  |
  +-- JSX transform on body
  |
  +-- Rewrite function signature for paramNames
```

### SWC Behavioral Rules (from transform.rs reference)

**Rule 1: IdentType classification** [VERIFIED: swc-reference-only/transform.rs line 95]
SWC uses `IdentType::Var(bool)` where the bool indicates constness. Only `Var` types are eligible for capture -- `Fn` and `Class` types are excluded (they trigger diagnostic errors instead).

**Rule 2: Scope partitioning** [VERIFIED: swc-reference-only/transform.rs line 637]
```
partition(|(_, t)| matches!(t, IdentType::Var(_)))
```
The `decl_stack` is partitioned into `Var` types (eligible for capture) and non-Var types (invalid captures that produce diagnostics).

**Rule 3: compute_scoped_idents** [VERIFIED: swc-reference-only/transform.rs line 638]
Takes descendant identifiers (used in the closure) and declaration-stack variables, returns the intersection -- identifiers that are both used in the closure AND declared in an enclosing scope.

**Rule 4: .w() hoisting target** [VERIFIED: swc-reference-only/transform.rs lines 1324-1384]
- No captures (only q:p params): hoist to current component's top (depth 0 for root)
- Has captures (scoped_idents non-empty): hoist to the outermost scope where ALL captures are in scope
- The QRL declaration (without captures) is always at module scope
- The `.w([captures])` call is hoisted to the target depth

**Rule 5: element_lifted_params (q:p/q:ps)** [VERIFIED: swc-reference-only/transform.rs lines 2225-2292]
- In a loop context: collect iteration variables used by ANY event handler on the element
- Not in a loop: collect union of captures from ALL event handlers on the element
- These become the q:ps array, and each handler gets paramNames with `_` padding for unused slots

**Rule 6: Handler capture pre-computation** [VERIFIED: swc-reference-only/transform.rs lines 1300-1322]
`compute_handler_captures()` collects identifiers used in a handler expression, partitions against decl_stack, filters out function parameters. The result is the set of variables the handler captures from enclosing scope.

**Rule 7: Capture sorting** [VERIFIED: swc-reference-only/transform.rs line 2284]
`all_captures.sort()` -- captures from non-loop handlers are sorted alphabetically. This determines the order in q:ps and consequently the paramNames slot assignment.

### Key Snapshot Patterns

**Pattern A: Multi-handler q:ps with unified slots** (`moves_captures_when_possible`)
```
// Three handlers on one button, each capturing different subsets:
// onClick$ captures [sig], onDblClick$ captures [foo, sig], onHover$ captures [bar, sig]
// q:ps = [bar, foo, sig] (alphabetically sorted union)
// onClick$ paramNames = [_, _1, _2, _3, sig]       -- bar=_2, foo=_3, sig used
// onDblClick$ paramNames = [_, _1, _2, foo, sig]    -- bar=_2 unused, foo/sig used
// onHover$ paramNames = [_, _1, bar, _3, sig]       -- bar used, foo=_3 unused, sig used
```

**Pattern B: Loop with cross-scope capture** (`example_component_with_event_listeners_inside_loop`)
```
// Handler inside .map() captures `cart` from component scope and `item` from loop
// cart -> cross-scope capture -> _captures[0] + .w([cart])
// item -> loop-local -> function parameter via q:p
// Segment: (_, _1, item) => { const cart = _captures[0]; cart.push(item); }
// Parent: const sym = q_sym.w([cart]); ... q:p: item
```

**Pattern C: Nested loops with mixed captures** (`should_transform_handlers_capturing_cross_scope_in_nested_loops`)
```
// Outer loop var: i, rowIndex; Inner loop var: j, cellIndex, cellKey
// Handler captures: rowIndex (outer) + cellIndex (inner)
// rowIndex -> cross-scope (outer loop) -> _captures + .w([rowIndex])
// cellIndex -> loop-local (inner loop) -> function parameter via q:p
// The .w() is hoisted to the outer map callback body
```

**Pattern D: Component-scope capture without loop** (`example_multi_capture`)
```
// Nested $() captures _rawProps from component scope
// ALL captures become paramNames? NO -- nested $() uses _captures + .w()
// Only event handlers in non-loop context use paramNames for ALL captures
// Component$ child captures use _captures mechanism
```

### Anti-Patterns to Avoid

- **Treating all captures as paramNames:** Only event handlers (ctxKind === 'eventHandler') use the paramNames delivery. Nested $() calls and non-event-handler QRLs use _captures + .w().
- **Alphabetical sort on loop-local vars:** Loop-local vars in paramNames follow declaration order, not alphabetical. But q:ps values ARE sorted alphabetically.
- **Missing unified slots:** When multiple handlers are on the same element, they MUST share a unified param list. Each handler uses `_N` padding for slots it doesn't use.
- **Wrong .w() hoisting scope:** .w() must be hoisted to where ALL its capture variables are in scope. For loop captures, this means above the inner loop but inside the outer scope where the captured var was declared.

## Existing Code Analysis

### What Works

The current implementation in `transform.ts` already:
1. Detects loop contexts via `extractionLoopMap` [VERIFIED: transform.ts line 1088]
2. Partitions captures into loop-local vs cross-scope [VERIFIED: transform.ts lines 1218-1261]
3. Generates basic paramNames padding with `generateParamPadding()` [VERIFIED: transform.ts line 1215]
4. Attempts slot unification for multi-handler elements [VERIFIED: transform.ts lines 1265-1360]
5. Injects _captures unpacking via `injectCapturesUnpacking()` [VERIFIED: segment-codegen.ts line 66]
6. Handles .w() in both inline and hoisted positions [VERIFIED: segment-codegen.ts lines 540-577]

### What Needs Fixing

Based on snapshot comparison of failing tests:

**1. q:ps capture collection mismatch (CAP-01)**
The SWC reference collects the UNION of all event handler captures on an element, sorted alphabetically, as q:ps values. Our implementation may not match this -- specifically:
- Non-loop elements: SWC collects all handler captures and provides them via q:ps (not just loop vars)
- The unified slot allocation must match SWC's alphabetical ordering of the q:ps union

**2. .w() hoisting scope calculation (CAP-02)**
SWC's `compute_hoist_target_depth()` determines where .w() declarations land. Our implementation uses a simpler heuristic that may not match. Key differences:
- SWC hoists to the highest scope where ALL captures are available
- For nested loops, this means the .w() can land in an outer loop callback, not just the component scope

**3. captureNames ordering (CAP-03)**
SWC sorts cross-scope captures alphabetically. Our implementation sorts them too (`crossScopeCaptures.sort()` at line 1259), but the initial collection order may differ if `uniqueCaptures` is ordered differently.

**4. Function signature rewriting (CAP-01)**
The `rewriteFunctionSignature()` function in segment-codegen.ts rewrites the closure's parameter list to match paramNames. This must handle:
- Expression-body arrow functions: `() => expr` -> `(_, _1, var) => expr`
- Block-body arrow functions: `() => { ... }` -> `(_, _1, var) => { ... }`
- Functions with existing params that get replaced

**5. Convergence test scope**
The convergence test checks `captures` (boolean) metadata AND segment code AST. The segment code AST comparison implicitly validates:
- Function signatures (paramNames)
- _captures unpacking lines (captureNames)
- .w() hoisting declarations in parent segments

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AST parsing for segment body | Custom parser | oxc-parser `parseSync` | Already used throughout; handles JSX/TS |
| Scope tracking | Custom scope walker | oxc-walker `getUndeclaredIdentifiersInFunction` | Already integrated; handles var hoisting, block scoping |
| Source text surgery | AST codegen | magic-string / string slicing | Project convention; avoids lossy reprint |

## Common Pitfalls

### Pitfall 1: _rawProps capture confusion
**What goes wrong:** Component$ closures that destructure props (`({foo, bar}) => ...`) have their parameter renamed to `_rawProps` by SWC. Nested $() calls that capture destructured props actually capture `_rawProps` (the parent's parameter), not the individual destructured names.
**Why it happens:** SWC renames the component$ parameter to `_rawProps` and destructures inside the body. The nested closure captures `_rawProps` as a single variable.
**How to avoid:** The TS optimizer already handles this via props destructuring transform. Ensure capture analysis runs AFTER the props transform so it sees the transformed names.
**Warning signs:** `captureNames: ["foo", "bar"]` instead of `captureNames: ["_rawProps"]` in nested component segments.

### Pitfall 2: Missing unified slots causes divergent paramNames
**What goes wrong:** Two event handlers on the same element get independent paramNames without shared slot positions. Handler A gets `[_, _1, foo]` and Handler B gets `[_, _1, bar]`, but SWC expects `[_, _1, _2, foo]` and `[_, _1, bar, _3]` (unified 4-slot layout).
**Why it happens:** Slot unification must consider ALL handlers on the element, compute the union set, assign slots alphabetically, then each handler uses `_N` for unused slots.
**How to avoid:** Ensure the slot unification pass at transform.ts lines 1265-1360 correctly groups handlers by element position and produces a shared slot map.
**Warning signs:** Different paramNames lengths for handlers on the same element.

### Pitfall 3: .w() hoisting at wrong scope
**What goes wrong:** .w() declaration lands inside a loop body instead of outside, or at component scope instead of inside an outer loop callback.
**Why it happens:** The hoist target must be the highest scope where ALL captured variables are in scope. For nested loops, a variable from the outer loop is only in scope inside the outer loop callback body -- not at component scope.
**How to avoid:** Walk capture variables' declaration scopes and find the outermost scope containing all of them.
**Warning signs:** `.w()` appearing inside `.map()` callback bodies instead of before `return` in outer callbacks.

### Pitfall 4: Sort order mismatch between q:ps and paramNames
**What goes wrong:** q:ps array values are in one order, but paramNames use a different order.
**Why it happens:** q:ps is always alphabetically sorted, and paramNames slots must match q:ps position. If captures are collected in declaration order but q:ps is alphabetical, the mapping breaks.
**How to avoid:** Always sort the union set alphabetically first, then assign positional slots based on that sorted order.
**Warning signs:** Correct captures but wrong positional padding in function signature.

## Code Examples

### SWC's element_lifted_params pattern (non-loop case)

```typescript
// Source: swc-reference-only/transform.rs lines 2262-2288
// When NOT in a loop, collect union of all handler captures on the element:
const allCaptures: string[] = [];
for (const handler of elementHandlers) {
  const captures = computeHandlerCaptures(handler);
  for (const cap of captures) {
    if (!allCaptures.includes(cap)) {
      allCaptures.push(cap);
    }
  }
}
allCaptures.sort(); // alphabetical sort for consistent slot assignment
// These become q:ps values and paramNames slots
```

### SWC's .w() hoisting target computation

```typescript
// Source: swc-reference-only/transform.rs lines 1335-1384
// Simplified behavioral description:
function computeHoistTarget(scopedIdents: string[], declStack: Scope[]): number {
  if (scopedIdents.length === 0) {
    // No capture array -- hoist to current component's top
    return currentComponentDepth;
  }
  // Find the shallowest scope where ALL captures are declared
  const minDeclScope = declStack.findIndex(scope =>
    scopedIdents.every(cap => 
      declStack.slice(0, scope + 1).some(s => s.has(cap))
    )
  );
  // Find the outermost hoisting scope containing that declaration scope
  return Math.min(minDeclScope, currentDepth);
}
```

### Correct unified slot assignment

```typescript
// For element with handlers capturing [sig], [foo, sig], [bar, sig]:
// Union: {bar, foo, sig} -> sorted: [bar, foo, sig]
// q:ps = [bar, foo, sig]
// Slot map: bar=2, foo=3, sig=4 (slots 0,1 are _, _1 padding)
// Handler [sig]:      paramNames = [_, _1, _2, _3, sig]
// Handler [foo, sig]: paramNames = [_, _1, _2, foo, sig]
// Handler [bar, sig]: paramNames = [_, _1, bar, _3, sig]
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | Loop-local vars as paramNames with correct padding | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_component_with_event_listeners_inside_loop"` | Yes |
| CAP-01 | Unified slots for multi-handler elements | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "moves_captures_when_possible"` | Yes |
| CAP-02 | Cross-scope _captures + .w() | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_transform_handlers_capturing_cross_scope_in_nested_loops"` | Yes |
| CAP-02 | Component-scope .w() hoisting | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_multi_capture"` | Yes |
| CAP-03 | Metadata match | convergence | `npx vitest run tests/optimizer/convergence.test.ts` (all 210 tests) | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "capture_name"` (targeted)
- **Per wave merge:** `npx vitest run` (full 695-test suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; convergence count >= 73 (zero regressions)

### Wave 0 Gaps
None -- existing test infrastructure (convergence.test.ts, debug-diff.test.ts, capture-analysis.test.ts) covers all phase requirements.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 137 failing convergence tests include ~15-25 that are primarily blocked by capture classification issues (the rest are blocked by JSX, migration, or sync issues) | Architecture Patterns | Plan scope may be too large or too small; verify by running targeted tests after fixes |
| A2 | SWC's non-loop q:ps behavior (union of all handler captures) is the same pattern used for component-scope event handlers, not just loop contexts | Key Snapshot Patterns | If wrong, non-loop capture delivery may need different handling |

## Open Questions (RESOLVED)

1. **How many tests will this phase actually fix?** (RESOLVED — track empirically during execution)
   - What we know: 137 tests fail, capture classification is one of 7 failure families
   - What's unclear: Exact count of tests blocked PRIMARILY by capture issues vs tests where capture is one of multiple issues
   - Recommendation: Track convergence count before and after each plan; accept that some tests may need Phase 19/20 fixes too

2. **Does the convergence test compare captureNames/paramNames metadata arrays?** (RESOLVED — AST comparison implicitly validates, no change needed)
   - What we know: The test compares `captures` (boolean) and segment code AST, but NOT `captureNames` or `paramNames` arrays directly [VERIFIED: convergence.test.ts lines 120-131]
   - What's unclear: Whether metadata mismatch in captureNames/paramNames causes segment code AST mismatch (it should, since these arrays determine function signature and _captures unpacking)
   - Recommendation: The code AST comparison implicitly validates both -- no change needed

## Sources

### Primary (HIGH confidence)
- swc-reference-only/transform.rs -- Capture classification, .w() hoisting, q:p/q:ps generation, paramNames extraction
- swc-reference-only/code_move.rs -- _captures injection, segment module generation
- src/optimizer/transform.ts -- Current TS capture classification implementation
- src/optimizer/segment-codegen.ts -- Current TS segment code generation
- src/optimizer/rewrite-parent.ts -- Current TS .w() wrapping in parent module
- match-these-snaps/ -- 209 snapshot files with expected SWC output

### Secondary (MEDIUM confidence)
- tests/optimizer/convergence.test.ts -- Convergence test framework (verified by reading source)
- .planning/phases/17-inline-hoist-strategy-convergence/ -- Phase 17 summaries documenting remaining root causes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already decided in CLAUDE.md
- Architecture: HIGH - current codebase fully analyzed, SWC reference read
- Pitfalls: HIGH - derived from snapshot comparison and SWC source analysis

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable domain -- capture classification rules unlikely to change)
