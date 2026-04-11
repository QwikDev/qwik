# Phase 10: Segment Identity Batch 1 - Research

**Researched:** 2026-04-10
**Domain:** Segment naming, display name disambiguation, emit mode naming, capture metadata
**Confidence:** HIGH

## Summary

Phase 10 addresses segment identity failures across 21 snapshots. Through diagnostic analysis, I identified 5 distinct root causes: (1) duplicate display name disambiguation -- the Rust optimizer appends `_1`, `_2` counters when multiple segments share the same display name, but the TS optimizer produces duplicates; (2) prod mode `s_` prefix naming -- in prod mode, the Rust uses `s_{hash}` for the segment name instead of `{displayName}_{hash}`; (3) import-source naming for bare identifier arguments -- when `$()` wraps a simple imported identifier, the Rust uses the import source path for naming; (4) JSX attribute extraction scoping -- the TS optimizer extracts `$-suffixed` JSX attributes unconditionally, but should only extract from JSX inside marker call boundaries; (5) captures metadata -- the `captures` flag should be `false` when all captured variables are handled via `_auto_` parameter injection rather than `.w()` calls.

Of the 21 snapshots, 1 already passes (example_component_with_event_listeners_inside_loop), 2 have only parent-module issues (no segment identity fix needed), and 18 have segment identity failures. The dominant issue is duplicate name disambiguation, affecting 13 snapshots.

**Primary recommendation:** Implement duplicate display name tracking with `_1`/`_2` counters in `extractSegments()`, then add prod-mode `s_` prefix naming in `transform.ts`, then fix the remaining edge cases.

## Standard Stack

No new libraries needed. All fixes are algorithm changes within existing modules:

| Module | File | Change Type |
|--------|------|-------------|
| extract.ts | `src/optimizer/extract.ts` | Duplicate name counter, JSX extraction scoping |
| naming.ts | `src/hashing/naming.ts` | Possible adjustments for `s_` naming |
| transform.ts | `src/optimizer/transform.ts` | Prod mode `s_` naming, captures metadata fix |
| context-stack.ts | `src/optimizer/context-stack.ts` | Import-source naming support |

## Architecture Patterns

### Pattern 1: Duplicate Display Name Disambiguation
**What:** When multiple segments produce the same display name, the Rust optimizer appends `_1`, `_2`, etc. to disambiguate. The first occurrence gets no suffix (index 0), subsequent duplicates get `_1`, `_2`, etc. [VERIFIED: Rust transform.rs `register_context_name`]

**How it works in Rust:**
```
let index = match self.segment_names.get_mut(&display_name) {
    Some(count) => { *count += 1; *count }
    None => 0,
};
if index == 0 {
    self.segment_names.insert(display_name.clone(), 0);
} else {
    write!(display_name, "_{}", index).unwrap();
}
```

**Implementation in TS:**
```typescript
// In extractSegments() or transform.ts post-processing:
const segmentNameCounts = new Map<string, number>();

for (const extraction of extractions) {
  const baseName = extraction.displayName; // e.g., "test.tsx_App_component"
  const contextPortion = /* strip fileStem prefix */;
  
  const count = segmentNameCounts.get(contextPortion) ?? 0;
  segmentNameCounts.set(contextPortion, count === 0 ? 0 : count);
  
  if (count > 0) {
    // Append _1, _2, etc. to both displayName and contextPortion
    // Recompute hash since input changed
    const newContext = contextPortion + '_' + count;
    const newHash = qwikHash(scope, relPath, newContext);
    extraction.displayName = fileStem + '_' + newContext;
    extraction.symbolName = newContext + '_' + newHash;
    extraction.hash = newHash;
    extraction.canonicalFilename = extraction.displayName + '_' + newHash;
  }
  
  segmentNameCounts.set(contextPortion, count + 1);
}
```

**Affected snapshots (13):** example_8, example_capturing_fn_class, example_custom_inlined_functions, example_explicit_ext_no_transpile, example_explicit_ext_transpile, example_exports, example_functional_component_capture_props, example_invalid_references, example_invalid_segment_expr1, example_jsx, example_multi_capture, example_noop_dev_mode, example_jsx_listeners [VERIFIED: diagnostic run against all 21 snapshots]

### Pattern 2: Prod Mode `s_` Prefix Naming
**What:** In prod mode (`EmitMode::Prod`), the Rust optimizer uses `s_{hash}` for the segment `name` field instead of `{contextPortion}_{hash}`. The `displayName` and `canonicalFilename` are unaffected. [VERIFIED: Rust transform.rs `register_context_name`]

**Rust logic:**
```rust
let symbol_name = if matches!(self.options.mode, EmitMode::Dev | EmitMode::Test) {
    format!("{}_{}", display_name, hash64)
} else {
    format!("s_{}", hash64)
};
```

Dev and Test (which maps to TS 'lib') modes use the full `{contextPortion}_{hash}` name. Only prod mode uses the abbreviated `s_{hash}`.

**Implementation in TS:** In `transform.ts`, after computing symbolName normally, check `emitMode === 'prod'` and override: `ext.symbolName = 's_' + ext.hash;`

**Affected snapshots (2):** example_build_server (mode: 'prod', isServer: true), example_prod_node (mode: 'prod') [VERIFIED: snapshot-options.ts]

### Pattern 3: Import-Source Naming for Bare Identifier Args
**What:** When a `$()` marker call receives a bare identifier (not a function expression) that was imported from a module, the Rust optimizer names the segment using the import source path. Example: `useStyles$(css3)` where `css3` is `import css3 from './style.css'` produces display name `style_css` (from the escaped import path). [VERIFIED: example_capture_imports snapshot]

**Implementation approach:** When extracting a marker call where the argument is an `Identifier` (not ArrowFunctionExpression/FunctionExpression), look up the identifier in the imports map. If found, use the import source path (basename, escaped) as the naming context instead of the context stack.

**Affected snapshots (1):** example_capture_imports [VERIFIED: diagnostic run]

### Pattern 4: JSX Attribute Extraction Scoping
**What:** The TS optimizer extracts `$-suffixed` JSX attributes (like `onClick$`) unconditionally, even outside marker call boundaries. The Rust optimizer only extracts these when inside a marker call scope (e.g., inside `component$()`, `qwikify$()` arg). [VERIFIED: example_jsx_import_source snapshot]

**Current behavior:** In `extract.ts`, JSX attribute extraction at lines 630-720 fires for ANY `$-suffixed` JSX attribute with a function value, regardless of nesting context.

**Required behavior:** Track whether we're inside a marker call argument during the walk. Only extract `$-suffixed` JSX attributes when inside a marker call scope. In example_jsx_import_source:
- `App`'s `onClick$` should NOT be extracted (App is a plain arrow function, not inside any marker)
- `App2`'s inner `onClick$` should NOT be extracted (even though App2 uses `qwikify$`, the inner JSX uses React runtime per `@jsxImportSource react`)

**Implementation:** Add a depth counter (`markerDepth`) that increments on entering a marker call's argument and decrements on leaving. Only extract JSX attrs when `markerDepth > 0`.

**Affected snapshots (1):** example_jsx_import_source [VERIFIED: diagnostic run]

### Pattern 5: Captures Metadata Fix
**What:** The `captures` boolean should be `false` when captured variables are handled via `_auto_` parameter injection (paramNames) rather than explicit `.w()` calls. Currently the TS optimizer sets `captures = captureNames.length > 0` after migration filtering, but the Rust sets `captures = false` when all captures become params. [VERIFIED: example_functional_component_2 snapshot metadata]

**Root cause:** After variable migration removes some captureNames, if the remaining captures are all handled via `_auto_` params, the `captures` flag should be `false`. The Rust differentiates between `.w()` captures and `_auto_` params -- only `.w()` captures set `captures: true`.

**Implementation:** After computing captureNames and applying migration filtering, if the segment uses `_auto_` parameter injection (paramNames populated), set `captures = false` since the captures are delivered via function parameters, not `.w()`.

**Affected snapshots (1):** example_functional_component_2 [VERIFIED: diagnostic run]

### Anti-Patterns to Avoid
- **Modifying hashes without updating all references:** When disambiguating with `_1` suffix, the hash changes because the hash input includes the context portion. All three fields (symbolName, displayName, canonicalFilename) must be updated together.
- **Applying `s_` naming too early:** The `s_` prefix should only affect the `name` field in SegmentAnalysis metadata and the exported const name in segment code. The `displayName` and `canonicalFilename` should retain the full human-readable form even in prod mode.
- **Breaking parent module QRL declarations:** Segment naming changes cascade to parent module QRL declarations (`const q_{symbolName}` and import paths). Parent rewriting uses `ext.symbolName` and `ext.canonicalFilename`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Display name escaping | Custom regex replacer | `escapeSym()` in naming.ts | Already matches Rust's escape_sym() behavior |
| Hash computation | New hash function | `qwikHash()` in siphash.ts | Already verified byte-identical to Rust |

## Common Pitfalls

### Pitfall 1: Disambiguation Counter Scope
**What goes wrong:** Counter must be scoped per file, not globally across all files in a batch transform.
**Why it happens:** The Rust's `segment_names` HashMap is per-file (per `QwikTransform` instance).
**How to avoid:** Create the counter map inside `extractSegments()` or at the file-level in `transformModule()`.
**Warning signs:** Counters bleed across files in multi-file transforms.

### Pitfall 2: Disambiguation Must Happen Before Hash Computation
**What goes wrong:** Adding `_1` suffix to display name but keeping the original hash produces wrong segment identity.
**Why it happens:** The hash input includes the context portion, so `App_component` and `App_component_1` produce different hashes.
**How to avoid:** After appending the disambiguation suffix, recompute the hash using the new context portion.
**Warning signs:** Segment name has `_1` suffix but hash matches the unsuffixed version.

### Pitfall 3: Parent Module References Must Use Updated Names
**What goes wrong:** Parent module still references old (pre-disambiguation) symbol names in QRL declarations.
**Why it happens:** Parent rewriting reads `ext.symbolName` -- if disambiguation happens after parent rewriting, the parent uses stale names.
**How to avoid:** Disambiguation must happen BEFORE parent module rewriting. Best place is as a post-processing step on `extractSegments()` results, before any downstream consumers.
**Warning signs:** Parent module has `q_App_component_ckEPmXZlub0` but segment is named `App_component_1_w0t0o3QMovU`.

### Pitfall 4: Prod `s_` Naming Only Affects `name`, Not `canonicalFilename`
**What goes wrong:** Setting canonicalFilename to `s_{hash}` breaks import paths.
**Why it happens:** Confusion between `name` (the exported const name) and `canonicalFilename` (the file path stem).
**How to avoid:** In prod mode: `name = s_{hash}`, `displayName = full_form`, `canonicalFilename = full_form_{hash}`. The file is still `test.tsx_Foo_component_HTDRsvUbLiE.tsx` but the export inside is `export const s_HTDRsvUbLiE = ...`.
**Warning signs:** Import paths in parent module contain `s_` prefix.

### Pitfall 5: JSX Extraction Depth Tracking Must Account for Nesting
**What goes wrong:** Nested marker calls inside JSX attributes cause double-extraction.
**Why it happens:** If `onClick$={$(() => ...)}` is inside a marker scope, both the JSX attr extraction AND the `$()` marker detection fire.
**How to avoid:** The existing code already skips JSX attr extraction when the value is a `$()` call (line 650: `if expr is CallExpression and isMarkerCall -> skip`). The depth tracking only needs to gate the non-marker-call extraction path.
**Warning signs:** Duplicate segments for the same JSX attribute.

## Code Examples

### Duplicate Name Counter (Post-Processing)
```typescript
// Source: Rust transform.rs register_context_name + diagnostic analysis
function disambiguateExtractions(
  extractions: ExtractionResult[],
  fileStem: string,
  relPath: string,
  scope?: string,
): void {
  const nameCounters = new Map<string, number>();
  const prefix = fileStem + '_';
  
  for (const ext of extractions) {
    // Extract context portion from displayName
    const contextPortion = ext.displayName.startsWith(prefix)
      ? ext.displayName.slice(prefix.length)
      : ext.displayName;
    
    const existing = nameCounters.get(contextPortion);
    if (existing === undefined) {
      // First occurrence: index 0, no suffix
      nameCounters.set(contextPortion, 0);
    } else {
      // Duplicate: increment counter, append suffix
      const newIndex = existing + 1;
      nameCounters.set(contextPortion, newIndex);
      
      const newContext = contextPortion + '_' + newIndex;
      const newHash = qwikHash(scope, relPath, newContext);
      ext.displayName = prefix + newContext;
      ext.hash = newHash;
      ext.symbolName = newContext + '_' + newHash;
      ext.canonicalFilename = ext.displayName + '_' + newHash;
    }
  }
}
```

### Prod Mode `s_` Naming
```typescript
// Source: Rust transform.rs register_context_name
// In transform.ts, after extractions are finalized:
if (emitMode === 'prod') {
  for (const ext of extractions) {
    if (ext.isInlinedQrl) continue; // inlinedQrl has its own naming
    ext.symbolName = 's_' + ext.hash;
    // displayName and canonicalFilename remain unchanged
  }
}
```

### Marker Scope Tracking for JSX Extraction
```typescript
// Source: diagnostic analysis of example_jsx_import_source
// In extract.ts walk():
let markerCallDepth = 0;

// In enter(), when detecting a marker call:
if (isMarkerCall(node, imports, customInlined)) {
  markerCallDepth++;
  // ... existing extraction logic ...
}

// In leave(), when leaving a marker call:
if (node.type === 'CallExpression' && isMarkerCall(node, imports, customInlined)) {
  markerCallDepth--;
}

// Gate JSX attribute extraction:
if (jsxAttrName !== null && markerCallDepth > 0) {
  // ... existing JSX attr extraction ...
}
```

## Diagnostic Analysis Results

### Snapshot Failure Categories
| Category | Count | Snapshots |
|----------|-------|-----------|
| Duplicate name disambiguation | 13 | example_8, example_capturing_fn_class, example_custom_inlined_functions, example_explicit_ext_no_transpile, example_explicit_ext_transpile, example_exports, example_functional_component_capture_props, example_invalid_references, example_invalid_segment_expr1, example_jsx, example_multi_capture, example_noop_dev_mode, example_jsx_listeners |
| Prod mode `s_` naming | 2 | example_build_server, example_prod_node |
| Import-source naming | 1 | example_capture_imports |
| JSX extraction scoping | 1 | example_jsx_import_source |
| Captures metadata | 1 | example_functional_component_2 |
| Already passing (seg identity OK) | 1 | example_component_with_event_listeners_inside_loop |
| Parent-only failures (no seg fix) | 2 | example_dev_mode, example_preserve_filenames_segments |

### Cross-Category Overlaps
- Most segment identity failures also cause parent module failures (BOTH_FAIL) because parent QRL declarations reference the wrong segment names.
- example_jsx_listeners has BOTH duplicate name issues AND missing `_1` suffixed segments.
- example_prod_node has BOTH `s_` naming AND duplicate segments (three onClick$ handlers on same element).

### Current State
- 32 convergence tests fully passing
- 442 unit tests passing
- All 21 Phase 10 snapshots currently fail (18 segment identity, 2 parent-only, 1 passing)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Disambiguation counter increments per-occurrence in AST traversal order (first=0, second=1) matching Rust's HashMap insertion order | Pattern 1 | Wrong `_1`/`_2` assignment; easily testable |
| A2 | Import-source naming uses the basename of the import path, not the full path | Pattern 3 | Wrong display name for example_capture_imports |
| A3 | `captures: false` when all captures become `_auto_` params (no `.w()`) | Pattern 5 | Metadata mismatch; need to verify Rust `captures` semantics more deeply |
| A4 | JSX attr extraction should be gated on marker call depth, not on `@jsxImportSource` pragma | Pattern 4 | May need pragma detection instead or in addition |

## Open Questions

1. **Import-source naming edge cases**
   - What we know: `useStyles$(css3)` where `css3` is imported from `./style.css` produces `style_css`
   - What's unclear: Does this apply to all bare identifier args, or only specific marker functions? What about template literals or other non-function args?
   - Recommendation: Start with the single known case (example_capture_imports) and verify behavior

2. **JSX extraction scoping vs @jsxImportSource**
   - What we know: example_jsx_import_source has `@jsxImportSource react` AND `onClick$` in a non-marker scope
   - What's unclear: Is the fix just marker depth gating, or does `@jsxImportSource` need explicit handling?
   - Recommendation: Implement marker depth gating first, test if that alone fixes the snapshot

3. **Parent-only failures in example_dev_mode and example_preserve_filenames_segments**
   - What we know: Segment identity is correct, parent module output differs
   - What's unclear: Root cause of parent failures (may be unrelated to naming)
   - Recommendation: These may resolve as side effects of other fixes, or may need separate investigation

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts -t "example_8"` |
| Full suite command | `npx vitest run tests/optimizer/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEG-01 | Duplicate display name disambiguation | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_8"` | Yes (convergence.test.ts) |
| SEG-02 | Prod mode s_ prefix naming | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_prod_node"` | Yes |
| SEG-03 | Import-source naming | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_capture_imports"` | Yes |
| SEG-04 | JSX extraction scoping | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_jsx_import_source"` | Yes |
| SEG-05 | Captures metadata correctness | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_functional_component_2"` | Yes |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "{snapshot}"` for affected snapshots
- **Per wave merge:** `npx vitest run tests/optimizer/` (full optimizer suite)
- **Phase gate:** All 21 Phase 10 snapshots pass + all 32 previously-passing snapshots still pass

### Wave 0 Gaps
None -- existing test infrastructure (convergence.test.ts) covers all phase requirements.

## Sources

### Primary (HIGH confidence)
- Rust transform.rs `register_context_name` -- duplicate name disambiguation logic [VERIFIED: WebFetch of GitHub raw source]
- Rust transform.rs emit mode naming -- `s_` prefix in prod mode [VERIFIED: WebFetch of GitHub raw source]
- All 21 snapshot files in `match-these-snaps/` -- expected segment metadata [VERIFIED: direct file reads]
- Diagnostic script run -- actual vs expected segment comparison [VERIFIED: local execution]

### Secondary (MEDIUM confidence)
- Rust transform.rs import-source naming for bare identifier args -- inferred from snapshot output, not directly confirmed in Rust code [ASSUMED]

## Metadata

**Confidence breakdown:**
- Duplicate disambiguation: HIGH - verified Rust logic and tested all 21 snapshots
- Prod mode naming: HIGH - verified Rust logic, confirmed with snapshot metadata
- Import-source naming: MEDIUM - verified from snapshot output but Rust mechanism uncertain
- JSX scoping: HIGH - clear from snapshot analysis, root cause identified in extract.ts
- Captures metadata: MEDIUM - Rust semantics of captures vs paramNames needs deeper verification

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, no external dependency changes expected)
