# Phase 3: Capture Analysis and Variable Migration - Research

**Researched:** 2026-04-10
**Domain:** Scope analysis, capture detection, variable migration, _captures injection, .w() wrapping
**Confidence:** HIGH

## Summary

Phase 3 adds two tightly coupled capabilities to the optimizer: (1) capture analysis -- detecting which variables referenced inside `$()` closures are declared outside that closure boundary, and (2) variable migration -- moving or re-exporting module-level declarations so segments can access them via imports rather than captures.

Capture analysis determines which identifiers cross `$()` boundaries. When a variable declared in the parent scope is used inside a `$()` closure, the segment module must receive it via the `_captures` array (imported from `@qwik.dev/core`), and the parent must wrap the QRL reference with `.w([captured1, captured2])`. The `captureNames` metadata lists which variables are captured (sorted alphabetically), and `captures: true` flags the segment. Variable migration is a separate mechanism for **module-level** (root scope) declarations: variables used only by one segment get physically moved into that segment, variables used by multiple segments or by both root code and segments get re-exported as `_auto_VARNAME` and imported by the segment.

oxc-walker provides `getUndeclaredIdentifiersInFunction()` which does a two-pass scope analysis to find identifiers referenced but not declared within a function/arrow -- exactly what is needed for capture detection. The ScopeTracker class provides `isDeclared()`, `getDeclaration()`, and `getCurrentScope()` for fine-grained scope queries.

**Primary recommendation:** Build in layers: (1) capture detection using oxc-walker's ScopeTracker, (2) _captures injection in segment codegen, (3) .w() wrapping in parent rewrite, (4) captureNames/paramNames metadata, (5) variable migration analysis (single-use move, shared re-export), (6) _auto_ export generation. Test each against the 33 snapshots with `captures: true` and the 15 snapshots with `_auto_` patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAPT-01 | Detect variables referenced inside `$()` closure but declared outside | oxc-walker `getUndeclaredIdentifiersInFunction()` + ScopeTracker provide scope-aware detection. Verified algorithm from 33 snapshots with `captures: true`. |
| CAPT-02 | Inject `_captures` array access in segment modules | Segment codegen must prepend `const varName = _captures[N];` lines and add `import { _captures } from "@qwik.dev/core"`. Verified pattern from example_multi_capture, issue_150, example_use_client_effect. |
| CAPT-03 | Generate `.w([captured1, captured2])` wrapping on QRL references | Parent module rewrites `q_symbolName` to `q_symbolName.w([var1, var2])` when segment has captures. Verified from all 33 capture snapshots. |
| CAPT-04 | Handle `var` hoisting across `$()` boundaries correctly | `var` declarations are function-scoped and hoist to the enclosing function, not block. ScopeTracker handles this via its scope hierarchy. |
| CAPT-05 | Handle destructured parameters and bindings in capture analysis | Component params with destructuring (e.g., `({count, rest: [I2, ...]}`) produce captures for each destructured binding. Verified from example_functional_component_capture_props showing 16 captured bindings from complex destructuring. |
| CAPT-06 | Distinguish between captures (outer scope) and paramNames (positional args from q:p/q:ps) | `captureNames` lists variables from `_captures` array. `paramNames` lists function parameters including padding (`_`, `_1`). These are separate metadata arrays. Verified from should_extract_single_qrl showing both paramNames and captureNames on same segment. |
| MIG-01 | Move variable declarations used only by one segment into that segment | helperFn in example_segment_variable_migration is physically moved into the segment module code, not captured. Segment does NOT import it -- it appears as a local declaration. |
| MIG-02 | Export shared variables from parent as `_auto_VARNAME` | Variables used by multiple segments or by both root code and segments get `export { VARNAME as _auto_VARNAME }` at end of parent module. Segments import as `import { _auto_VARNAME as VARNAME } from "./test"`. Verified from 15 _auto_ snapshots. |
| MIG-03 | Keep exported variables at root level (never migrate) | `publicHelper` in example_segment_variable_migration stays at root because it has `export`. Verified: exported bindings are never moved. |
| MIG-04 | Don't migrate declarations with side effects | `state = { counter: 0, id: Math.random()... }` in should_keep_module_level_var stays at root (has side effects via Math.random). Re-exported as _auto_ instead. |
| MIG-05 | Handle complex destructuring patterns during migration | `const { a, b } = ...` where only `a` is used by segment: entire destructuring stays at root, `a` is re-exported as `_auto_a`. Verified from should_keep_non_migrated_binding_from_shared_destructuring_declarator. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Parser**: oxc-parser (no Babel)
- **Walker**: oxc-walker with ScopeTracker (no estraverse)
- **Codegen**: magic-string for parent module, string building for segments
- **Hashing**: siphash npm package (already verified in Phase 1)
- **Testing**: vitest
- **No @babel/***: Forbidden
- **No recast/jscodeshift**: Forbidden
- **Hash stability**: Must match SWC optimizer output exactly

## Standard Stack

### Core (all already installed from Phase 1-2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| oxc-walker | 0.7.0 | ScopeTracker for scope-aware capture detection | `getUndeclaredIdentifiersInFunction()` provides exact capture detection [VERIFIED: installed, API inspected] |
| oxc-parser | 0.124.0 | Parse source and segment bodies for scope analysis | Already installed [VERIFIED: installed] |
| magic-string | 0.30.21 | Inject .w() wrapping in parent module | Already installed [VERIFIED: installed] |

### No new dependencies needed

Phase 3 uses only libraries already installed in Phases 1-2. No new npm packages required.

## Architecture Patterns

### Recommended Project Structure
```
src/
  optimizer/
    capture-analysis.ts      # CAPT-01..06: Detect captures, compute captureNames/paramNames
    variable-migration.ts    # MIG-01..05: Analyze migration eligibility, compute _auto_ exports
    segment-codegen.ts       # MODIFIED: Add _captures injection (CAPT-02)
    rewrite-parent.ts        # MODIFIED: Add .w() wrapping (CAPT-03), _auto_ exports (MIG-02)
    transform.ts             # MODIFIED: Wire capture + migration into pipeline
    extract.ts               # MODIFIED: Pass capture info through ExtractionResult
```

### Pattern 1: Two Categories of Cross-Boundary Variables

**What:** There are TWO distinct mechanisms for variables crossing `$()` boundaries, and they apply at different scope levels.

**Category A: Captures (_captures array) -- for non-root-scope variables**
When a `$()` closure is inside a function (e.g., inside a component$ body), and it references variables declared in the enclosing function scope, those variables become captures. The parent segment passes them via `.w([vars])`, and the child segment receives them via `_captures[N]`.

```typescript
// INPUT:
component$(() => {
  const state = useStore({count: 0});
  useBrowserVisibleTask$(() => {
    state.count++;  // `state` is captured
  });
})

// PARENT SEGMENT OUTPUT:
export const Comp_component_xxx = () => {
  const state = useStore({count: 0});
  useBrowserVisibleTaskQrl(q_task_xxx.w([state]));  // .w() passes captures
};

// CHILD SEGMENT OUTPUT:
import { _captures } from "@qwik.dev/core";
export const Comp_component_useBrowserVisibleTask_xxx = () => {
  const state = _captures[0];  // receives via _captures
  state.count++;
};
```

**Category B: Variable Migration (_auto_ exports) -- for root-scope declarations**
When a `$()` closure at the top level references a module-level variable, it does NOT use _captures. Instead, the variable is either:
1. **Moved** into the segment (if used by only one segment and not exported and no side effects)
2. **Re-exported** as `_auto_VARNAME` (if used by multiple segments, or exported, or has side effects)

```typescript
// INPUT:
const helperFn = (msg) => console.log(msg);  // Used by only one segment
const SHARED = { value: 42 };                 // Used by multiple segments
export const handler = $(() => { helperFn('hi'); SHARED.value; });
export const other = $(() => { SHARED.value; });

// PARENT OUTPUT:
const SHARED = { value: 42 };
export const handler = q_handler_xxx;
export const other = q_other_xxx;
export { SHARED as _auto_SHARED };  // re-exported for segments

// handler SEGMENT: helperFn is MOVED here (not captured, not _auto_)
import { _auto_SHARED as SHARED } from "./test";
const helperFn = (msg) => console.log(msg);  // moved in
export const handler_xxx = () => { helperFn('hi'); SHARED.value; };
```

[VERIFIED: example_segment_variable_migration, should_keep_module_level_var_used_in_both_main_and_qrl]

### Pattern 2: Capture Detection Algorithm

**What:** Use oxc-walker's ScopeTracker to determine which identifiers in a `$()` closure body are declared outside it.

**Algorithm:**
1. Walk the full AST with ScopeTracker to build scope maps
2. For each extraction, record the scope key at the point of the `$()` call
3. Collect all identifiers referenced inside the closure body
4. For each identifier, check if its declaration scope is OUTSIDE the closure scope
5. Filter out: globals (console, Math, etc.), imports (handled separately by import collection), and the function's own parameters
6. Sort remaining captures alphabetically -- this is the `captureNames` array

**Key function from oxc-walker:** `getUndeclaredIdentifiersInFunction(node)` does a two-pass analysis:
1. First pass: walk with ScopeTracker to build all scope data
2. Freeze the tracker
3. Second pass: walk again, collecting identifiers that are NOT declared AND NOT binding identifiers

[VERIFIED: oxc-walker/dist/index.mjs source inspection]

```typescript
// oxc-walker's built-in function (simplified):
function getUndeclaredIdentifiersInFunction(node) {
  const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });
  const undeclared = new Set<string>();
  walk(node, { scopeTracker });  // first pass: build scopes
  scopeTracker.freeze();
  walk(node, {
    scopeTracker,
    enter(node, parent) {
      if (node.type === 'Identifier' && !isBindingIdentifier(node, parent) && !scopeTracker.isDeclared(node.name)) {
        undeclared.add(node.name);
      }
    }
  });
  return Array.from(undeclared);
}
```

### Pattern 3: _captures Injection in Segment Code

**What:** When a segment has captures, the segment body must be modified to receive captured variables from the `_captures` array.

**Injection pattern:** [VERIFIED: all 33 capture snapshots]

```typescript
import { _captures } from "@qwik.dev/core";
//
export const SegmentName_xxx = () => {
    const capturedVar1 = _captures[0];
    const capturedVar2 = _captures[1];
    // ... original segment body with capturedVars used inline ...
};
```

**Critical details:**
- `_captures` is imported from `@qwik.dev/core` (separate import statement)
- Captures are unpacked as `const` declarations at the start of the function body
- Index order matches the alphabetical sort of `captureNames`
- The original references to captured variables in the body remain unchanged (the const declaration shadows them)
- The segment's arrow function parameters are REMOVED if they were the captured variables (the captures replace them)

### Pattern 4: .w() Wrapping in Parent Module

**What:** In the parent module, QRL references for segments with captures get `.w([vars])` wrapping.

**Two contexts for .w():** [VERIFIED: all capture snapshots]

**Context A: Inline in call expression**
```typescript
// When the QRL is passed directly to a function (e.g., useTaskQrl):
useBrowserVisibleTaskQrl(q_task_xxx.w([state]));
```

**Context B: Hoisted before loop (for event handlers in loops)**
```typescript
// When handlers capture variables but are inside loops:
const App_component_div_tr_td_a_q_e_click_xxx = q_click_xxx.w([selectedItem]);
// ... later in JSX:
"q-e:click": App_component_div_tr_td_a_q_e_click_xxx
```

**Variable order in .w():** Same alphabetical order as `captureNames` [VERIFIED: example_functional_component_capture_props shows 16 variables sorted alphabetically]

### Pattern 5: paramNames vs captureNames Distinction

**What:** Two separate metadata arrays track different things.

**captureNames:** Variables that come from `_captures` array -- declared outside the `$()` closure, passed via `.w()`. Only present when `captures: true`.

**paramNames:** The function's formal parameters as written in the output code. This includes:
- For component$: the props parameter (e.g., `["props"]` or `["_rawProps"]`)
- For event handlers in loops: padding parameters `["_", "_1", "row"]` where `_` and `_1` are unused positional padding and `row` comes from the loop variable via `q:p`
- For regular `$()` closures with params: the actual parameter names

**Component$ special behavior:** When component$ has destructured parameters like `({count, ...rest})`, the output converts this to a single `_rawProps` parameter and the destructured bindings become captures of `_rawProps`. [VERIFIED: example_multi_capture shows `_rawProps` as paramNames, with `_rawProps` also in captureNames of child segments]

**Event handler loop behavior:** Handlers inside `.map((row) => ...)` get `paramNames: ["_", "_1", "row"]` where row is injected via the `q:p` mechanism. This is Phase 4 (LOOP-*) scope but the capture infrastructure must support the paramNames metadata. [VERIFIED: should_extract_single_qrl]

### Pattern 6: Variable Migration Decision Tree

**What:** For each module-level declaration referenced by a segment:

```
Is the declaration exported?
  YES -> Keep at root, re-export as _auto_VARNAME (MIG-03)
  NO  -> Is the declaration used by root-level code (outside any segment)?
    YES -> Keep at root, re-export as _auto_VARNAME
    NO  -> Is the declaration used by more than one segment?
      YES -> Keep at root, re-export as _auto_VARNAME (MIG-02)
      NO  -> Does the declaration have side effects?
        YES -> Keep at root, re-export as _auto_VARNAME (MIG-04)
        NO  -> Is it part of a destructuring where other bindings stay at root?
          YES -> Keep at root, re-export as _auto_VARNAME (MIG-05)
          NO  -> MOVE the declaration into the segment (MIG-01)
```

[VERIFIED: Decision tree derived from all 15 _auto_ snapshots plus example_segment_variable_migration]

### Pattern 7: _auto_ Export Mechanics

**What:** When a variable is re-exported for segment access, the parent module appends `export { VARNAME as _auto_VARNAME }` and the segment module imports `import { _auto_VARNAME as VARNAME } from "./test"`.

**Key details:** [VERIFIED: all 15 _auto_ snapshots]
- The `_auto_` exports go at the END of the parent module (after all other code)
- The import path in segments uses the file stem WITHOUT extension: `"./test"` not `"./test.tsx"`
- Multiple _auto_ exports are separate statements (one per variable)
- The original variable name is preserved in the segment via `as VARNAME` aliasing

### Pattern 8: Captures Metadata Flag

**What:** The `captures: boolean` flag in segment metadata indicates whether the segment has any captured variables.

**Important distinction:** [VERIFIED: example_segment_variable_migration]
- Variables accessed via `_auto_` imports do NOT set `captures: true`
- Only variables passed via `.w()` and received via `_captures` set `captures: true`
- Module-level variable migration uses imports, not captures
- The `captures` flag is `false` for top-level segments that use _auto_ imports

This means: `captures: true` is ONLY for scope-level captures within function bodies, not for module-level variable migration.

### Anti-Patterns to Avoid

- **Treating _auto_ variables as captures:** Module-level migration (_auto_) and scope-level captures (_captures) are completely separate mechanisms. Don't conflate them.
- **Using getUndeclaredIdentifiersInFunction for root-level segments:** For top-level `$()` closures, variables reference module-level declarations -- these go through migration, not captures.
- **Modifying the closure body text directly for _captures:** Don't try to regex-replace variable references. Instead, prepend `const varName = _captures[N];` at the start of the function body, which shadows the outer declaration.
- **Sorting captures by appearance order:** Captures are sorted ALPHABETICALLY, not by order of appearance. This matches the Rust optimizer behavior.
- **Forgetting to remove closure parameters that become captures:** When component$ has `(props) => { ... }` and an inner `$()` captures `props`, the inner segment's function should have NO parameters (the captures provide the values). The exception is event handlers which keep their positional parameters (_, _1, row).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scope analysis | Manual scope tracking | oxc-walker ScopeTracker | Handles let/const/var/function hoisting, destructuring, catch params, imports |
| Undeclared identifier detection | Manual identifier collection + scope comparison | `getUndeclaredIdentifiersInFunction()` from oxc-walker | Two-pass algorithm handles all edge cases including nested scopes |
| Side effect detection | Custom heuristic | Conservative: flag any initializer that is not a literal, arrow function, or function expression | Edge cases in side effect analysis are complex; be conservative |

**Key insight:** oxc-walker's `getUndeclaredIdentifiersInFunction()` is purpose-built for this exact use case. It handles all JavaScript scoping rules including var hoisting, destructuring patterns, catch clause bindings, and import bindings. Using it avoids reimplementing a scope analysis engine.

## Common Pitfalls

### Pitfall 1: Capture vs Migration Confusion
**What goes wrong:** Treating all cross-boundary variable access as captures, generating `.w()` + `_captures` for module-level variables.
**Why it happens:** Both mechanisms solve "variable used inside $() but declared outside," but at different scope levels.
**How to avoid:** Check the scope level of the declaration. Root-scope declarations go through migration (_auto_ exports). Function-scope declarations go through captures (_captures array). The distinguishing factor is: is the `$()` call directly inside a function body (captures), or at the top level of the module (migration)?
**Warning signs:** Segments importing `_captures` when they should be importing `_auto_VARNAME`, or vice versa.

### Pitfall 2: Capture Ordering
**What goes wrong:** Captures appear in wrong order, causing runtime failures where `_captures[0]` gets the wrong variable.
**Why it happens:** Not sorting captureNames alphabetically.
**How to avoid:** Always sort captures alphabetically. Both `captureNames` in metadata and the `.w([])` array in the parent module must use the same alphabetical order. The `_captures[N]` unpacking in the segment must match.
**Warning signs:** Metadata comparison fails on captureNames order, or runtime capture values are swapped.

### Pitfall 3: Global Identifiers Appearing as Captures
**What goes wrong:** `console`, `Math`, `setTimeout`, `JSON` etc. appear as captured variables.
**Why it happens:** `getUndeclaredIdentifiersInFunction()` returns ALL undeclared identifiers, including globals.
**How to avoid:** Filter out known globals and identifiers that come from imports (already tracked by `collectImports()`). The Rust optimizer filters against its declaration stack which includes imports; we must do the same.
**Warning signs:** Segments have `_captures` for `console` or `Math`, parent has `.w([console])`.

### Pitfall 4: Destructuring Migration Edge Cases
**What goes wrong:** Moving a binding from a destructuring pattern breaks the remaining bindings.
**Why it happens:** `const { a, b } = obj;` -- if only `a` is used by a segment, you cannot move just `a` without also taking `b` and the initializer.
**How to avoid:** When a variable comes from a destructuring declarator (object or array pattern), and other bindings from the same declarator are used elsewhere, keep the ENTIRE declarator at root and re-export the needed binding as `_auto_a`. Never split a destructuring declarator.
**Warning signs:** `const { b } = obj;` left orphaned at root after `a` was incorrectly extracted.

### Pitfall 5: Self-Referential Variables
**What goes wrong:** A variable references itself in its initializer (e.g., `const sig = useAsync$(() => { sig.value++ })`) and capture analysis breaks TDZ rules.
**Why it happens:** The segment captures `sig` but `sig` doesn't exist yet when the capture `.w()` is called.
**How to avoid:** The Rust optimizer uses a `_ref = {}` pattern: `_ref.sig = useAsyncQrl(q_xxx.w([_ref.sig])); const { sig } = _ref;`. This is an advanced pattern that may be Phase 3 scope or deferred.
**Warning signs:** TDZ errors at runtime for self-referential component variables.

### Pitfall 6: Side Effect Detection False Negatives
**What goes wrong:** A variable with side effects gets migrated into a segment, executing its side effects lazily instead of at module load.
**Why it happens:** Assuming only `Math.random()` has side effects. Any function call, property access on unknown objects, or `new` expressions may have side effects.
**How to avoid:** Be conservative: only migrate if the initializer is (a) a literal, (b) an arrow/function expression, (c) a template literal with only literal parts, (d) an object/array literal with only literal values. Everything else stays at root.
**Warning signs:** Module initialization behavior changes -- code that used to run at module load now runs lazily.

### Pitfall 7: _auto_ Import Path
**What goes wrong:** Segment imports `_auto_VARNAME` from wrong path.
**Why it happens:** Using the full path with extension instead of the stem.
**How to avoid:** The import path for _auto_ uses the parent module path WITHOUT extension: `"./test"` not `"./test.tsx"`. Strip the extension.
**Warning signs:** Module resolution errors at runtime, or AST comparison fails on import paths.

## Code Examples

### Capture Analysis
```typescript
// Source: Pattern derived from oxc-walker API [VERIFIED: oxc-walker dist/index.mjs]
import { walk, ScopeTracker, getUndeclaredIdentifiersInFunction, isBindingIdentifier } from 'oxc-walker';

interface CaptureInfo {
  captureNames: string[];  // alphabetically sorted
  captures: boolean;
}

function analyzeCapturesForClosure(
  closureNode: any,       // The ArrowFunctionExpression or FunctionExpression from $() arg
  parentScopeDecls: Set<string>,  // Identifiers declared in the enclosing scope
  importedNames: Set<string>,     // Names from import statements
): CaptureInfo {
  // Get all undeclared identifiers in the closure
  const undeclared = getUndeclaredIdentifiersInFunction(closureNode);
  
  // Filter to only those declared in parent scope (not globals, not imports)
  const captures = undeclared
    .filter(name => parentScopeDecls.has(name) && !importedNames.has(name))
    .sort(); // alphabetical sort is CRITICAL
  
  return {
    captureNames: captures,
    captures: captures.length > 0,
  };
}
```

### _captures Injection in Segment
```typescript
// Source: Derived from 33 capture snapshots [VERIFIED: snapshot corpus]
function injectCaptures(
  bodyText: string,
  captureNames: string[],
): string {
  if (captureNames.length === 0) return bodyText;
  
  // Generate _captures unpacking line
  const unpackLine = captureNames
    .map((name, i) => `const ${name} = _captures[${i}]`)
    .join(', ') + ';';
  
  // Inject at start of function body (after opening brace)
  // The bodyText is the arrow function: `() => { ... }` or `(params) => { ... }`
  // Need to insert after the opening `{`
  // For expression bodies `() => expr`, convert to block body first
  
  return bodyText; // Actual implementation uses AST/magic-string
}
```

### .w() Wrapping in Parent
```typescript
// Source: Derived from capture snapshots [VERIFIED: example_use_client_effect, issue_150]
function wrapQrlWithCaptures(
  qrlRef: string,      // e.g., "q_task_xxx"
  captureNames: string[], // e.g., ["state"]
): string {
  const captureList = captureNames.join(',\n        ');
  return `${qrlRef}.w([\n        ${captureList}\n    ])`;
}
```

### Variable Migration Analysis
```typescript
// Source: Derived from 15 _auto_ snapshots [VERIFIED: snapshot corpus]
interface MigrationDecision {
  action: 'move' | 'reexport' | 'keep';
  varName: string;
  reason: string;
}

function analyzeVariableMigration(
  declarations: ModuleLevelDecl[],
  segmentUsage: Map<string, Set<string>>,  // segmentName -> used variables
  rootUsage: Set<string>,                   // variables used in root (non-segment) code
  exportedNames: Set<string>,               // variables with `export` keyword
): MigrationDecision[] {
  const decisions: MigrationDecision[] = [];
  
  for (const decl of declarations) {
    if (exportedNames.has(decl.name)) {
      // MIG-03: exported variables never migrate
      const usedBySegments = [...segmentUsage.entries()]
        .filter(([_, vars]) => vars.has(decl.name));
      if (usedBySegments.length > 0) {
        decisions.push({ action: 'reexport', varName: decl.name, reason: 'exported' });
      } else {
        decisions.push({ action: 'keep', varName: decl.name, reason: 'exported, not used by segments' });
      }
      continue;
    }
    
    const usedBySegments = [...segmentUsage.entries()]
      .filter(([_, vars]) => vars.has(decl.name));
    
    if (usedBySegments.length === 0) {
      decisions.push({ action: 'keep', varName: decl.name, reason: 'not used by segments' });
    } else if (rootUsage.has(decl.name)) {
      decisions.push({ action: 'reexport', varName: decl.name, reason: 'used in root code' });
    } else if (usedBySegments.length > 1) {
      decisions.push({ action: 'reexport', varName: decl.name, reason: 'shared by multiple segments' });
    } else if (decl.hasSideEffects) {
      decisions.push({ action: 'reexport', varName: decl.name, reason: 'has side effects' });
    } else if (decl.isPartOfDestructuring) {
      decisions.push({ action: 'reexport', varName: decl.name, reason: 'shared destructuring' });
    } else {
      decisions.push({ action: 'move', varName: decl.name, reason: 'single segment, safe to move' });
    }
  }
  
  return decisions;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useLexicalScope()` | `_captures` array import | Recent Qwik versions | 4/209 snapshots still use old `useLexicalScope` style; current codebase uses `_captures` |
| `useBlockStmt` injection (Rust SWC) | `_captures` import + const unpacking | Current | Simpler pattern -- just import and destructure |

**Deprecated/outdated:**
- `useLexicalScope()`: Older Qwik versions used this. Current optimizer uses `_captures` imported from `@qwik.dev/core`. Our implementation targets the `_captures` approach.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getUndeclaredIdentifiersInFunction()` handles all ESTree node types from oxc-parser (TypeScript types stripped by oxc-transform before analysis) | Pattern 2 | MEDIUM -- if oxc-parser emits non-standard nodes, the function may miss identifiers. Testable immediately against snapshots. |
| A2 | Side effect detection can be conservative (literals and function expressions only) without causing snapshot mismatches | Pattern 6 | LOW -- snapshots show only simple cases being migrated. Conservative approach matches Rust behavior. |
| A3 | Self-referential variable pattern (_ref = {}) can be deferred to later if no snapshots in Phase 3 scope require it | Pitfall 5 | MEDIUM -- component_level_self_referential_qrl snapshot requires this, but may be Phase 4 scope since it involves JSX |
| A4 | Import filtering for capture analysis can reuse the existing `collectImports()` from marker-detection.ts | Pattern 2 | LOW -- collectImports already tracks all import bindings |

## Open Questions (RESOLVED)

1. **How to distinguish function-scope captures from module-scope migration?**
   - RESOLVED: Check if the `$()` call's parent segment is `null` (top-level) → use migration. If parent is non-null → use captures. Verified against all snapshot cases.

2. **Should Phase 3 handle the component$ _rawProps renaming?**
   - RESOLVED: No. Phase 3 handles basic capture where component$ params are captured as-is. The _rawProps renaming is Phase 4 scope (props destructuring).

3. **getUndeclaredIdentifiersInFunction and global filtering**
   - RESOLVED: Filter against import bindings + well-known globals list (globalThis properties). Any identifier neither declared in parent scope nor imported is excluded from captures.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies -- Phase 3 uses only already-installed npm packages)

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (exists from Phase 1) |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAPT-01 | Detect captured variables crossing $() boundaries | unit | `pnpm vitest run tests/optimizer/capture-analysis.test.ts` | No -- Wave 0 |
| CAPT-02 | Inject _captures array in segment modules | unit | `pnpm vitest run tests/optimizer/segment-codegen.test.ts` | Partial -- extend existing |
| CAPT-03 | Generate .w() wrapping on QRL references | unit | `pnpm vitest run tests/optimizer/rewrite-parent.test.ts` | Partial -- extend existing |
| CAPT-04 | Handle var hoisting correctly | unit | Covered by CAPT-01 test (specific test cases) | No -- Wave 0 |
| CAPT-05 | Handle destructured parameters in captures | unit | Covered by CAPT-01 test (specific test cases) | No -- Wave 0 |
| CAPT-06 | Distinguish captures from paramNames | unit | `pnpm vitest run tests/optimizer/capture-analysis.test.ts` | No -- Wave 0 |
| MIG-01 | Move single-use variables to segments | unit | `pnpm vitest run tests/optimizer/variable-migration.test.ts` | No -- Wave 0 |
| MIG-02 | Export shared variables as _auto_VARNAME | unit | Covered by MIG-01 test file | No -- Wave 0 |
| MIG-03 | Keep exported variables at root | unit | Covered by MIG-01 test file | No -- Wave 0 |
| MIG-04 | Don't migrate side-effect declarations | unit | Covered by MIG-01 test file | No -- Wave 0 |
| MIG-05 | Handle destructuring during migration | unit | Covered by MIG-01 test file | No -- Wave 0 |

### Integration Tests

33 snapshots with `captures: true` and 15 snapshots with `_auto_` patterns serve as ground truth. The existing snapshot batch runner from Phase 1 can validate end-to-end output.

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + batch snapshot comparison for capture/migration snapshots

### Wave 0 Gaps
- [ ] `tests/optimizer/capture-analysis.test.ts` -- covers CAPT-01, CAPT-04, CAPT-05, CAPT-06
- [ ] `tests/optimizer/variable-migration.test.ts` -- covers MIG-01 through MIG-05

## Security Domain

Security enforcement is not applicable to this phase. Phase 3 is pure code transformation logic -- no user input processing, no network I/O, no authentication, no data storage. The optimizer operates on trusted source code from the local filesystem.

| ASVS Category | Applies | Reason |
|---------------|---------|--------|
| V2 Authentication | No | No auth in optimizer |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access control |
| V5 Input Validation | No | Input is trusted source code |
| V6 Cryptography | No | No crypto operations |

## Sources

### Primary (HIGH confidence)
- oxc-walker v0.7.0 dist/index.d.mts -- ScopeTracker API, getUndeclaredIdentifiersInFunction signature [VERIFIED: filesystem inspection]
- oxc-walker v0.7.0 dist/index.mjs -- getUndeclaredIdentifiersInFunction implementation [VERIFIED: filesystem inspection]
- 33 snapshot files with `captures: true` -- _captures injection and .w() wrapping patterns [VERIFIED: grep + content inspection]
- 15 snapshot files with `_auto_` -- variable migration patterns [VERIFIED: grep + content inspection]
- example_multi_capture.snap -- multi-variable capture with alphabetical sorting [VERIFIED: full content read]
- example_functional_component_capture_props.snap -- complex destructured captures (16 variables) [VERIFIED: full content read]
- example_segment_variable_migration.snap -- move vs re-export migration [VERIFIED: full content read]
- should_keep_module_level_var_used_in_both_main_and_qrl.snap -- root+segment shared variable [VERIFIED: full content read]
- should_keep_non_migrated_binding_from_shared_destructuring_declarator.snap -- destructuring edge case [VERIFIED: full content read]
- should_extract_single_qrl.snap -- paramNames + captureNames on same segment [VERIFIED: full content read]

### Secondary (MEDIUM confidence)
- [Qwik transform.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) -- Capture collection algorithm overview [VERIFIED: WebFetch]
- [Qwik code_move.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/code_move.rs) -- Variable migration and _auto_ export mechanics [VERIFIED: WebFetch]
- [Qwik collector.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/collector.rs) -- IdentCollector for gathering referenced identifiers [VERIFIED: WebFetch]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Capture analysis: HIGH -- Algorithm well-understood from 33 snapshots, oxc-walker API verified, Rust source cross-referenced
- Variable migration: HIGH -- All 15 _auto_ snapshots analyzed, decision tree fully mapped
- Pitfalls: HIGH -- Derived from concrete snapshot analysis showing exact patterns
- Architecture: HIGH -- Builds on established Phase 2 infrastructure with clear extension points

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain -- capture mechanics are core Qwik architecture)
