# Phase 20: Migration and Sync Convergence - Research

**Researched:** 2026-04-11
**Domain:** Variable migration decisions, _qrlSync serialization, parent/segment codegen convergence
**Confidence:** HIGH

## Summary

Phase 20 addresses two remaining failure families: variable migration decisions (MIGR-01/02/03) and _qrlSync serialization (SYNC-01). Investigation of SWC reference code and diff analysis of failing snapshots reveals four root causes:

1. **Root usage detection counts declaration-site identifiers as "root usage"**, causing single-segment-exclusive variables to be classified as "reexport" instead of "move". SWC's `build_main_module_usage_set` explicitly filters out declaration-site identifiers.
2. **Moved declarations don't carry their import dependencies** into the segment. SWC's migration copies the full declaration (e.g., `const { a } = source;`) AND ensures the segment imports its dependencies (`import { source } from "lib"`).
3. **_qrlSync in segment bodies lacks the serialized string argument**. The segment codegen does a naive `sync$( -> _qrlSync(` regex replace without adding the minified function text as a second argument. SWC's `handle_sync_qrl` always emits `_qrlSync(fn, "serialized")`.
4. **Shadowed variable detection is missing**. When a segment body locally declares a variable (e.g., `const t = translate()` inside a catch block), our `computeSegmentUsage` still attributes the root-level `t` identifier to the segment, causing spurious `_auto_t` exports.

**Primary recommendation:** Fix `computeSegmentUsage` to filter locally-declared identifiers from segment attribution, fix `_qrlSync` serialization in segment bodies, and ensure moved declarations carry their import dependencies.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGR-01 | Variable move vs reexport decisions produce correct parent and segment AST output | Root cause identified: computeSegmentUsage counting declaration-site identifiers as root usage; fix filtering + moved decl import deps |
| MIGR-02 | `_auto_` re-exports generated only where snapshot expected output includes them | Root cause same as MIGR-01: over-classifying as reexport instead of move; also shadowed var detection missing |
| MIGR-03 | Destructured binding migration produces AST-matching segment imports and body | Requires moved declarations to carry import dependencies into the segment |
| SYNC-01 | `_qrlSync()` calls produce AST-matching output for all sync-related snapshots | Root cause: segment codegen does regex replace without adding serialized string argument |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **API compatibility**: Drop-in replacement for NAPI module -- same function signature, same output shape
- **Hash stability**: Same hash algorithm as SWC optimizer
- **Runtime correctness**: Output must produce working Qwik apps
- **Technology**: oxc-parser, oxc-walker, magic-string, vitest (no Babel, no recast)
- **SWC reference files**: Read-only behavioral reference, not reimplementation target

## Standard Stack

No new libraries needed. All work is in existing codebase files.

### Core Files Affected
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/optimizer/variable-migration.ts` | Migration analysis | Fix rootUsage filtering, add locally-declared ident detection |
| `src/optimizer/segment-codegen.ts` | Segment module generation | Fix _qrlSync serialization, handle moved decl import deps |
| `src/optimizer/rewrite-parent.ts` | Parent module rewriting | Fix moved decl removal for shadowed vars |
| `src/optimizer/rewrite-calls.ts` | _qrlSync transform | Already correct for parent; need equivalent for segment bodies |
| `src/optimizer/transform.ts` | Orchestration | Wire import deps for moved declarations |

## Architecture Patterns

### Pattern 1: SWC Migration Flow (the target behavior)
**What:** SWC performs migration in a post-processing step after extraction
**When to use:** Understanding what our code must produce

The SWC flow (`apply_variable_migration` in parse.rs):
1. `analyze_root_dependencies` -- collects all root-level declarations with their dependency graph
2. `build_root_var_usage_map` -- maps root vars to which segments use them (via `local_idents`)
3. `build_main_module_usage_set` -- finds root vars still referenced by non-declaration module items
4. `find_migratable_vars` -- single-segment-exclusive, not exported, not imported, not used by main module
5. Transitive dependency collection -- if var A depends on var B, both migrate together
6. Safety filter -- ensures shared destructurings migrate as a unit

Key difference from our approach: SWC's `local_idents` for a segment are collected from the closure expression itself, filtering out locally-declared identifiers. Our `computeSegmentUsage` walks raw positions without filtering. [VERIFIED: swc-reference-only/dependency_analysis.rs, swc-reference-only/parse.rs]

### Pattern 2: _qrlSync Serialization
**What:** SWC's `handle_sync_qrl` uses `render_expr` to produce a minified string of the function
**When to use:** Understanding _qrlSync expected output

SWC flow (`handle_sync_qrl` in transform.rs lines 716-752):
1. Pop first arg from `sync$()` call
2. If it's an arrow/function expression, serialize via `render_expr` (SWC's minified printer)
3. Emit `_qrlSync(originalExpr, "minifiedString")`

Our parent-level handling is correct (`buildSyncTransform` in rewrite-calls.ts). The gap is in segment bodies where we do a naive regex replace without adding the serialized string. [VERIFIED: swc-reference-only/transform.rs:716-752, swc-reference-only/inlined_fn.rs:188-217]

### Pattern 3: Shadowed Variable Filtering
**What:** SWC's `get_local_idents` filters out locally-declared identifiers
**When to use:** Determining which root variables a segment actually references

SWC flow (`get_local_idents` in transform.rs lines 1091-1106):
1. Collect all identifiers in the expression via `IdentCollector`
2. Collect all locally-declared identifiers via `collect_local_declarations_from_expr`
3. Filter: `idents.retain(|id| !locally_declared.contains(id))`

This prevents a locally-declared `t` inside a catch block from being attributed as a reference to a root-level `t`. Our `computeSegmentUsage` lacks this filtering. [VERIFIED: swc-reference-only/transform.rs:1091-1106]

### Anti-Patterns to Avoid
- **Position-based segment attribution without scope analysis**: Our current `computeSegmentUsage` checks if an identifier's position falls within extraction arg ranges. This catches ALL identifiers including declaration-site bindings and shadowed locals. Must filter these out.
- **Regex-based sync$ transform in segments**: `bodyText.replace(/\bsync\$\(/g, '_qrlSync(')` doesn't add the serialized string. Need to parse and transform properly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Local declaration collection in closures | Manual AST position checks | oxc-walker walk with scope tracking | Need to identify all locally-declared identifiers within a closure to filter from segment usage |
| Function minification for _qrlSync | New minifier | Existing `minifyFunctionText` from rewrite-calls.ts | Already works correctly for parent-level; reuse for segment-level |

## Common Pitfalls

### Pitfall 1: Declaration-Site Identifiers Counted as Usage
**What goes wrong:** `const helperFn = (msg) => {...}` -- the `helperFn` identifier in the declaration is counted as "root usage", preventing migration
**Why it happens:** `computeSegmentUsage` walks ALL identifiers, including binding sites
**How to avoid:** Filter identifiers that are at declaration sites (check if parent is VariableDeclarator.id, FunctionDeclaration.id, etc.)
**Warning signs:** Variables that should be "move" are classified as "reexport"

### Pitfall 2: Shadowed Variables in Catch/Loop/Block Scopes
**What goes wrong:** `catch (err) { const t = translate(); }` -- the local `t` is confused with root-level `t`
**Why it happens:** Position-based attribution doesn't check scope
**How to avoid:** Collect locally-declared identifiers within each extraction's arg range and exclude them from segment usage
**Warning signs:** Spurious `_auto_` exports and imports for variables that are locally redeclared

### Pitfall 3: Moved Declarations Missing Import Dependencies
**What goes wrong:** `const { a } = source;` is moved to segment but `import { source } from "lib"` is not
**Why it happens:** Migration only moves the declaration text, not its transitive import dependencies
**How to avoid:** When moving a declaration, analyze what identifiers it references and ensure the segment imports them
**Warning signs:** Segment code references undefined variables

### Pitfall 4: _qrlSync Event Handler Prop Classification
**What goes wrong:** `_qrlSync(fn, "str")` is treated as a CallExpression and classified as "var" by classifyProp, putting the event handler in varProps instead of constProps
**Why it happens:** Our classifyProp (aligned with SWC is_const.rs in Phase 19) treats all call expressions as var. But SWC's is_const_expr has const_idents that include `_qrlSync` as a known const function.
**How to avoid:** This is part of the const_idents cross-cutting concern identified in Phase 19. For _qrlSync specifically, we could special-case it in classifyProp since it's always const-valued.
**Warning signs:** Event handlers appearing in varProps (2nd arg) instead of constProps (3rd arg)

### Pitfall 5: Root Declaration Removal with Comments
**What goes wrong:** When removing a moved declaration from parent, the comment above it (e.g., `// This helper is only used by...`) may not be removed
**Why it happens:** Our `declStart`/`declEnd` tracks the statement range but not preceding comments
**How to avoid:** SWC's minified printer naturally strips comments. Our magic-string approach should handle leading comments by extending the removal range or relying on AST comparison to ignore them.
**Warning signs:** Extra comments in parent output where declarations were removed

## Code Examples

### Fix 1: computeSegmentUsage with local declaration filtering

```typescript
// Source: [VERIFIED: swc-reference-only/transform.rs:1091-1106]
// Before computing segment usage, collect locally-declared identifiers
// within each extraction range and filter them out.

function collectLocalDeclarations(program: any, start: number, end: number): Set<string> {
  const locals = new Set<string>();
  walk(program, {
    enter(node: any) {
      if (node.start < start || node.end > end) return;
      // Variable declarators
      if (node.type === 'VariableDeclarator' && node.id) {
        collectBindingNames(node.id, locals);
      }
      // Function/class declarations
      if (node.type === 'FunctionDeclaration' && node.id) {
        locals.add(node.id.name);
      }
      // Catch clause parameter
      if (node.type === 'CatchClause' && node.param) {
        collectBindingNames(node.param, locals);
      }
      // Function parameters
      if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && node.params) {
        for (const param of node.params) {
          collectBindingNames(param, locals);
        }
      }
    }
  });
  return locals;
}
```

### Fix 2: _qrlSync serialization in segment bodies

```typescript
// Source: [VERIFIED: swc-reference-only/transform.rs:716-752]
// Instead of naive regex replace, find sync$() calls in bodyText
// and transform them to _qrlSync(originalFn, "minifiedFn")
// Reuse existing minifyFunctionText from rewrite-calls.ts

// In segment-codegen.ts, replace the regex approach:
// OLD: bodyText = bodyText.replace(/\bsync\$\(/g, '_qrlSync(');
// NEW: Parse sync$ calls, extract function arg, build _qrlSync(fn, "minified")
```

### Fix 3: Root usage filtering for declaration identifiers

```typescript
// Source: [VERIFIED: swc-reference-only/dependency_analysis.rs:341-377]
// SWC's build_main_module_usage_set skips:
// - Stmt::Decl (declaration statements)
// - ModuleDecl::Import
// - ModuleDecl::ExportNamed
// - ModuleDecl::ExportAll
// Only checks: expression statements, export default expressions, other module items

// Our computeSegmentUsage rootUsage should similarly exclude
// identifiers that appear as binding names in declarations
```

## Specific Snapshot Analysis

### Divergences Found (from diff analysis)

**example_segment_variable_migration:**
- `helperFn`: Should be MOVED to App segment (appears as `const helperFn = ...` in segment body). Our code re-exports as `_auto_helperFn` instead.
- Root cause: `helperFn` identifier in declaration site counted as root usage.
- Parent output: Should NOT have `helperFn` declaration or `_auto_helperFn` export.

**example_of_synchronous_qrl:**
- `_qrlSync(fn)` missing second arg `"serializedFn"`. Expected: `_qrlSync(function(event,target){...}, "function(event,target){event.preventDefault();}")`.
- Event handlers in wrong prop bucket: `constProps` vs `varProps`. This is the const_idents issue -- _qrlSync is a const call.
- Flags: `2` expected vs `3` actual (const_idents issue affecting bit 0).

**should_not_auto_export_var_shadowed_in_catch:**
- Root `const t = translate()` should become just `translate()` (call preserved, binding removed) because `t` is only used inside catch where it's locally redeclared.
- Our code incorrectly exports `_auto_t` and the segment imports it.
- Root cause: Shadowed variable detection missing.

**should_migrate_destructured_binding_with_imported_dependency:**
- `const { a } = source;` should be MOVED to segment with `import { source } from "lib"` added to segment imports.
- Parent should NOT keep the declaration or the `source` import.

### Tests In Scope vs Out of Scope

Many of the 135 failing tests have root causes in const_idents (Phase 19 deferred) or capture classification (Phase 18 deferred). Phase 20 specifically targets:

| Category | Approximate Count | Fixable in Phase 20 |
|----------|-------------------|---------------------|
| Variable migration (move vs reexport) | ~8-12 tests | Yes |
| Shadowed variable detection | ~4 tests | Yes |
| _qrlSync serialization | 1 test | Yes (serialization); partially (prop classification) |
| Destructured binding migration | ~2-3 tests | Yes |
| const_idents dependent | ~80+ tests | No (deferred) |

## State of the Art

| Old Approach (Current) | Current Approach (Needed) | Impact |
|-------------------------|---------------------------|--------|
| Position-based segment usage | Scope-aware segment usage with local decl filtering | Correct move vs reexport decisions |
| Regex sync$ -> _qrlSync in segments | Proper serialization with minified string arg | AST-matching _qrlSync output |
| Declaration text moved without deps | Declaration + import dependencies moved together | Correct segment self-containment |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The const_idents issue for _qrlSync prop classification can be special-cased without full const_idents tracking | Pitfall 4 | Low -- _qrlSync is a known Qwik internal, safe to hardcode as const |
| A2 | SWC's root declaration removal when a var becomes unused (e.g., `const t = translate()` -> `translate()`) follows specific rules we can replicate | Pitfall: shadowed vars | Medium -- need to verify if SWC removes binding or keeps side-effecting initializer |

## Open Questions

1. **Side-effecting initializer preservation**
   - What we know: SWC converts `const t = translate()` to just `translate()` when `t` is not used
   - What's unclear: Does SWC always preserve the call for side effects, or does it sometimes remove entirely?
   - Recommendation: Preserve the initializer call (drop binding, keep expression) for safety. This matches the `should_not_auto_export_var_shadowed_in_catch` snapshot.

2. **Comment handling on moved declarations**
   - What we know: SWC's minified output naturally strips comments from moved declarations
   - What's unclear: Whether our AST comparison treats extra comments as mismatches
   - Recommendation: AST comparison already ignores comments (they're not in the AST). This is a non-issue for convergence testing.

3. **const_idents special-casing for _qrlSync**
   - What we know: _qrlSync prop classification affects flags and prop bucket
   - What's unclear: Whether special-casing _qrlSync alone is enough or if other known-const calls need it too
   - Recommendation: Special-case `_qrlSync` and `_wrapProp` in classifyProp as const. This is a tactical fix; full const_idents tracking is deferred to Phase 21.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/variable-migration.test.ts` |
| Full suite command | `npx vitest run tests/optimizer/convergence.test.ts` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGR-01 | Variable move vs reexport decisions | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_segment_variable_migration"` | Yes |
| MIGR-02 | _auto_ re-exports only where expected | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_auto_export_var_shadowed"` | Yes |
| MIGR-03 | Destructured binding migration | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_migrate_destructured_binding"` | Yes |
| SYNC-01 | _qrlSync serialization | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_of_synchronous_qrl"` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/variable-migration.test.ts && npx vitest run tests/optimizer/convergence.test.ts`
- **Per wave merge:** Full convergence suite
- **Phase gate:** Convergence count >= 75 (no regressions) + target tests passing

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements via convergence snapshots and unit tests.

## Security Domain

Not applicable -- this phase modifies code transformation logic only. No authentication, session management, input validation, or cryptography concerns.

## Sources

### Primary (HIGH confidence)
- `swc-reference-only/transform.rs` lines 716-752 -- handle_sync_qrl behavior [VERIFIED]
- `swc-reference-only/transform.rs` lines 1091-1106 -- get_local_idents filtering [VERIFIED]
- `swc-reference-only/dependency_analysis.rs` -- full migration analysis flow [VERIFIED]
- `swc-reference-only/parse.rs` lines 984-1107 -- apply_variable_migration [VERIFIED]
- `swc-reference-only/inlined_fn.rs` lines 188-217 -- render_expr for sync serialization [VERIFIED]
- `swc-reference-only/code_move.rs` lines 100-220 -- segment import generation for migrated vars [VERIFIED]

### Secondary (MEDIUM confidence)
- Diff analysis of actual vs expected output for 3 key snapshots [VERIFIED: local tool execution]
- Convergence test baseline: 75/210 passing [VERIFIED: vitest run]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all changes in existing files
- Architecture: HIGH -- SWC reference code clearly documents the target behavior
- Pitfalls: HIGH -- identified from concrete diff analysis of failing snapshots

**Research date:** 2026-04-11
**Valid until:** 2026-04-25 (stable domain, no external dependencies)
