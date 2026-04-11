# Phase 9: Untransformed Extraction - Research

**Researched:** 2026-04-10
**Domain:** Marker detection, parse error recovery, inlinedQrl handling
**Confidence:** HIGH

## Summary

Phase 9 addresses 11 snapshots where extractions are NOT happening at all -- the parent module output is basically the input unchanged. This is fundamentally different from Phases 7-8 which fixed parent/segment shape for extractions that WERE happening.

Diagnostic investigation reveals **four distinct root causes** affecting these 11 snapshots:

1. **Non-Qwik `$` imports rejected by `isMarkerCall()`** (6 snapshots): `formAction$` from `'forms'`, `serverAuth$`/`auth$` from `'@auth/qwik'` are not recognized because `isMarkerCall()` gates on `isQwikCore`. The Rust optimizer treats ALL `$`-suffixed named imports as markers regardless of source package. [VERIFIED: Rust source `collector.rs` and `transform.rs` on GitHub]
2. **Renamed imports not matched** (1 snapshot): `component$ as Component`, `$ as onRender` -- local names don't end with `$` so they fail the first check in `isMarkerCall()`. Rust checks the imported specifier name, not the local name. [VERIFIED: Rust source `transform.rs` on GitHub]
3. **Parse errors with empty AST** (2 snapshots): `example_3` has stray `});`, `example_immutable_analysis` has JSX text/expression ambiguity. oxc-parser returns `program.body = []` for both, so zero extractions occur. SWC (used by Rust optimizer) recovers from these errors. [VERIFIED: oxc-parser `parseSync()` returns empty body for both inputs]
4. **`inlinedQrl()` pre-processed calls not extracted** (2 snapshots): `should_preserve_non_ident_explicit_captures` and `example_qwik_react` use `inlinedQrl()` which doesn't end with `$`. The Rust optimizer has dedicated `handle_inlined_qsegment()` for this. [VERIFIED: Rust source `transform.rs` on GitHub]

**Primary recommendation:** Fix `isMarkerCall()` to accept any `$`-suffixed named import (not just Qwik-core), check `importedName` for renamed imports, add `inlinedQrl` extraction support, and handle parse error recovery.

## Snapshot Categorization

### Category A: Non-Qwik `$` Markers (6 snapshots)

| Snapshot | `$` Function | Source Package |
|----------|-------------|----------------|
| `example_server_auth` | `serverAuth$`, `auth$` | `@auth/qwik` |
| `should_not_auto_export_var_shadowed_in_catch` | `formAction$` | `forms` |
| `should_not_auto_export_var_shadowed_in_do_while` | `formAction$` | `forms` |
| `should_not_auto_export_var_shadowed_in_labeled_block` | `formAction$` | `forms` |
| `should_not_auto_export_var_shadowed_in_switch` | `formAction$` | `forms` |
| `should_not_inline_exported_var_into_segment` | `formAction$`, `valiForm$` | `forms` |

**Root cause:** `isMarkerCall()` in `marker-detection.ts` line 164 checks `importInfo?.isQwikCore` which is `false` for non-Qwik packages.

**Fix:** Remove the `isQwikCore` gate. Any named import whose imported specifier ends with `$` should be treated as a marker. This matches Rust behavior where `global_collect.imports` includes all imports and `marker_functions` is populated from any `$`-suffixed specifier.

**Side effects of this fix:**
- The `$` -> `Qrl` import rewriting (e.g., `formAction$` -> `formActionQrl`) must also work for non-Qwik imports. Current `rewrite-imports.ts` likely handles this already since it uses `computeQrlCallee()`.
- The import rewriting for the Qrl variant must add an import from the SAME source package (e.g., `formActionQrl` from `'forms'`), not from `@qwik.dev/core`.

**Additional pattern -- variable shadowing:**
The `should_not_auto_export_var_*` snapshots test that module-level variables shadowed inside block scopes (catch, do-while, labeled block, switch) are NOT auto-exported. Looking at expected segments, the shadowed `x` or `t` is correctly omitted from `captureNames`. The `switch` case is special: when the segment references the outer `x` (last `return x;`), `x` IS included as a migrated variable in the segment. This tests that scope analysis correctly distinguishes shadowed vs. captured variables.

### Category B: Renamed Imports (1 snapshot)

| Snapshot | Local Name | Imported Name |
|----------|-----------|---------------|
| `example_renamed_exports` | `Component` | `component$` |
| (same) | `onRender` | `$` |

**Root cause:** `isMarkerCall()` checks `name.endsWith('$')` on the local callee name (`Component`, `onRender`) which returns false.

**Fix:** After the local name fails the `$` check, look up the import info and check `importInfo.importedName.endsWith('$')`. The canonical callee name resolution in `extract.ts` already resolves aliases via `resolveCanonicalCalleeName()`, so the display name and hash computation should work correctly once the marker is detected.

**Additional complexity:** The Rust optimizer uses the canonical (imported) name for the Qrl variant conversion (`component$` -> `componentQrl`) even when the local name differs. Our `computeQrlCallee()` already takes the canonical name, so this should work once detection is fixed.

### Category C: Parse Errors (2 snapshots)

| Snapshot | Error | Cause |
|----------|-------|-------|
| `example_3` | "Expected semicolon" at pos 222 | Stray `});` closing arrow function -- extra `)` |
| `example_immutable_analysis` | "Unexpected token `>`" | JSX text `[].map(() => (...))` without `{...}` wrapper in JSX children |

**Root cause:** oxc-parser returns `program.body = []` for both inputs. With no AST nodes to walk, `extractSegments()` returns zero results.

**Fix options (ordered by preference):**

1. **Input preprocessing:** Strip/fix known parse error patterns before parsing. For `example_3`, the stray `)` before `};` could be detected. This is fragile.

2. **Parse with error recovery:** oxc-parser is documented as a "partially recoverable parser" but for these specific errors it returns empty bodies. Check if newer oxc versions improve recovery. [ASSUMED]

3. **Fallback parser:** If oxc fails with errors and empty body, retry with a more lenient parser. This adds complexity and dependency.

4. **Accept oxc limitation and fix inputs:** If these are genuinely malformed inputs that happen to work in SWC, document the limitation. But this would mean 2 snapshots can never pass.

**Recommended approach:** For `example_3`, the input is genuinely syntactically invalid JavaScript (`export const App = () => { ... });` has unmatched parens). SWC's error recovery happens to produce a usable AST. We should check oxc's error recovery behavior more carefully and potentially file an issue upstream. As a pragmatic workaround, we could preprocess the input to fix the specific pattern (stray `)` before `};`).

For `example_immutable_analysis`, the issue is `[].map(() => (` appearing as raw text in JSX children (not wrapped in `{...}`). This is technically invalid JSX. SWC may be treating it differently.

### Category D: `inlinedQrl()` Extraction (2 snapshots)

| Snapshot | Pattern |
|----------|---------|
| `should_preserve_non_ident_explicit_captures` | `inlinedQrl(() => {...}, 'task', [left, true, right])` |
| `example_qwik_react` | `componentQrl(inlinedQrl((props) => {...}, "name", [captures]))` |

**Root cause:** `inlinedQrl()` is a pre-processed QRL call where extraction has already been done by a prior transform pass. The Rust optimizer has a dedicated `handle_inlined_qsegment()` method that:

1. Extracts the first argument (the closure) as a segment body
2. Uses the second argument (string literal) as the symbol name
3. Uses the third argument (array) as the capture list
4. Registers the segment with metadata
5. Rewrites the parent to use `qrl()` or `qrlDEV()` imports

**Fix:** Add `inlinedQrl` detection as a special case in extraction:
- Detect `inlinedQrl(expr, symbolName, captures?)` calls where `inlinedQrl` is imported from `@qwik.dev/core`
- Extract the first argument as segment body
- Parse second argument as string literal for symbol name
- Parse third argument as array for explicit captures
- The symbol name from the string literal is used directly (not computed via context stack)
- The `inlinedQrl_fn` in Rust matches both `inlinedQrl` and `_inlinedQrl`

**`example_qwik_react` additional complexity:**
- The input uses `componentQrl(inlinedQrl(...))` -- nested pre-processed patterns
- The `inlinedQrl` calls have explicit capture arrays as the third argument
- Captures include identifiers that are already `useLexicalScope()` references
- The `_auto_filterProps` export in the parent module is a special auto-export pattern
- The file path is `../node_modules/@builder.io/qwik-react/index.qwik.mjs` with custom path handling

**`should_preserve_non_ident_explicit_captures` additional complexity:**
- The explicit captures array `[left, true, right]` contains non-identifier values (`true`)
- Expected `captureNames` is `["left", "right"]` -- non-identifier captures are filtered
- Expected parent uses `qrlDEV()` (dev mode) with location info
- Expected segment preserves `_captures` references as-is

## Architecture Patterns

### Fix 1: Broaden `isMarkerCall()` (marker-detection.ts)

```typescript
// BEFORE (line 164):
if (importInfo?.isQwikCore) return true;

// AFTER:
// Any named import whose imported specifier ends with $ is a marker
const importInfo = imports.get(name);
if (importInfo && importInfo.importedName.endsWith('$')) return true;

// Also check if local name ends with $ AND is imported (from any source)
if (name.endsWith('$') && importInfo) return true;
```

This handles both:
- Non-Qwik packages: `formAction$` from `'forms'` -> `importedName='formAction$'` ends with `$`
- Renamed imports: `Component` (local) -> `importedName='component$'` ends with `$`

### Fix 2: Handle renamed import marker detection

The `isMarkerCall()` currently checks `name.endsWith('$')` first, then `importInfo?.isQwikCore`. For renamed imports where local name doesn't end with `$`:

```typescript
export function isMarkerCall(
  callExpr: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>
): boolean {
  const name = getCalleeName(callExpr);
  if (!name) return false;

  // Check import info: imported specifier ends with $
  const importInfo = imports.get(name);
  if (importInfo && importInfo.importedName.endsWith('$')) return true;

  // Check local name ends with $ and is imported
  if (name.endsWith('$') && importInfo) return true;

  // Check custom inlined
  if (customInlined.has(name)) return true;

  return false;
}
```

### Fix 3: `inlinedQrl()` extraction (new code path)

Add detection in `extract.ts` or a new `inlined-qrl-extract.ts`:

```typescript
// Detect inlinedQrl(expr, symbolName, captures?) calls
if (node.type === 'CallExpression' &&
    getCalleeName(node) === 'inlinedQrl' &&
    imports.get('inlinedQrl')?.isQwikCore) {
  // Extract: arg[0] = body, arg[1] = symbol name string, arg[2] = captures array
  const bodyArg = node.arguments[0];
  const nameArg = node.arguments[1];
  const capturesArg = node.arguments[2];
  // ... create ExtractionResult with fixed symbolName from nameArg
}
```

### Fix 4: Parse error recovery

For `example_3` and `example_immutable_analysis`, options:
- **Input repair heuristic:** Detect common SWC-recoverable patterns
- **Partial AST use:** If oxc returns partial results in errors, use what's available
- **Skip with documented limitation:** Mark as known oxc limitation

### Import Rewriting for Non-Qwik Packages

When rewriting `formAction$` -> `formActionQrl`, the import must come from the same source:

```typescript
// Input:  import { formAction$ } from 'forms';
// Output: import { formActionQrl } from 'forms';
//         import { qrl } from '@qwik.dev/core';
```

The `rewrite-imports.ts` logic must preserve the original source when the marker import is not from a Qwik package. The `qrl` import always comes from `@qwik.dev/core`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import source tracking for Qrl variants | Custom source resolution | Extend existing `ImportInfo.source` field | Already tracks source per import |
| AST error recovery | Custom error recovery parser | oxc-parser + input preprocessing if needed | Parser error recovery is complex; targeted preprocessing is safer |

## Common Pitfalls

### Pitfall 1: Breaking existing passing tests with broader marker detection
**What goes wrong:** Broadening `isMarkerCall()` to accept all `$`-suffixed imports could cause false positives where non-marker `$` functions get extracted.
**Why it happens:** Some `$` functions might exist that shouldn't be extracted (e.g., `sync$`).
**How to avoid:** `sync$` is already handled as a special case (isSyncMarker). The Rust optimizer treats all `$`-suffixed imports as markers, so matching that behavior is correct. Run full regression suite after the fix.
**Warning signs:** Previously passing tests fail.

### Pitfall 2: Import rewriting for Qrl variants from wrong source
**What goes wrong:** `formAction$` -> `formActionQrl` import comes from `@qwik.dev/core` instead of `'forms'`.
**Why it happens:** Current import rewriting assumes all Qrl variants come from Qwik core.
**How to avoid:** Track the original import source for each marker and use it for the Qrl variant import.
**Warning signs:** Parent module has wrong import source for third-party Qrl functions.

### Pitfall 3: `inlinedQrl` symbol name collisions with context stack
**What goes wrong:** `inlinedQrl()` calls use an explicit symbol name from the string argument, but the context stack might produce a different name.
**Why it happens:** Context stack naming is for new extractions; `inlinedQrl` has pre-determined names.
**How to avoid:** For `inlinedQrl` extractions, use the string literal name directly, bypassing the context stack naming.
**Warning signs:** Segment name mismatch between metadata and filename.

### Pitfall 4: Parse error recovery is incomplete
**What goes wrong:** Some inputs that SWC handles gracefully produce empty ASTs in oxc-parser.
**Why it happens:** Different parsers have different error recovery strategies.
**How to avoid:** Test each parse-error snapshot individually. If oxc cannot recover, implement targeted input preprocessing.
**Warning signs:** `program.body.length === 0` with non-empty errors array.

### Pitfall 5: Variable shadowing false capture
**What goes wrong:** A module-level variable `x` that is shadowed in a catch/switch/labeled block inside the extraction body is incorrectly added to captureNames.
**Why it happens:** Scope analysis doesn't account for block-scoped shadowing in these specific constructs.
**How to avoid:** The `analyzeCaptures` function should already handle this via `getUndeclaredIdentifiersInFunction()` from oxc-walker. Verify by checking the expected `captures: false` in all `should_not_auto_export_var_shadowed_*` snapshots.
**Warning signs:** `captureNames` includes variables that are shadowed in inner scopes.

## Code Examples

### Current `isMarkerCall()` (broken for non-Qwik imports and renamed imports)
```typescript
// Source: src/optimizer/marker-detection.ts line 153-170
export function isMarkerCall(
  callExpr: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>
): boolean {
  const name = getCalleeName(callExpr);
  if (!name) return false;
  if (!name.endsWith('$')) return false;       // <-- Fails for renamed imports
  const importInfo = imports.get(name);
  if (importInfo?.isQwikCore) return true;      // <-- Fails for non-Qwik packages
  if (customInlined.has(name)) return true;
  return false;
}
```

### Expected fix
```typescript
export function isMarkerCall(
  callExpr: any,
  imports: Map<string, ImportInfo>,
  customInlined: Map<string, CustomInlinedInfo>
): boolean {
  const name = getCalleeName(callExpr);
  if (!name) return false;

  // Check if this is an imported binding whose original name ends with $
  const importInfo = imports.get(name);
  if (importInfo && importInfo.importedName.endsWith('$')) return true;

  // Check custom inlined functions (these always have local name ending in $)
  if (name.endsWith('$') && customInlined.has(name)) return true;

  return false;
}
```

### `inlinedQrl` detection pattern
```typescript
// In extract.ts or dedicated handler
function isInlinedQrlCall(node: any, imports: Map<string, ImportInfo>): boolean {
  if (node.type !== 'CallExpression') return false;
  const name = getCalleeName(node);
  if (name !== 'inlinedQrl' && name !== '_inlinedQrl') return false;
  const info = imports.get(name);
  return info?.isQwikCore === true;
}
```

### Non-Qwik Qrl import rewriting
```typescript
// For formAction$ from 'forms':
// - marker import source: 'forms'
// - Qrl variant: 'formActionQrl'
// - Qrl variant import source: 'forms' (SAME as original)
// - qrl() import source: '@qwik.dev/core' (always Qwik)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest implicit config via package.json |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts -t "example_3"` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P9-01 | Non-Qwik `$` markers extracted | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_auto_export_var_shadowed_in_catch"` | existing |
| P9-02 | Renamed imports extracted | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_renamed_exports"` | existing |
| P9-03 | Parse error recovery | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_3"` | existing |
| P9-04 | `inlinedQrl` extraction | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_preserve_non_ident_explicit_captures"` | existing |
| P9-05 | Variable shadowing scope | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "should_not_auto_export_var_shadowed"` | existing |
| P9-06 | No regressions | all tests | `npx vitest run` | existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts -t "<target_snapshot>"`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + all 11 Phase 9 snapshots pass

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements via convergence tests.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | oxc-parser newer versions may improve error recovery for these specific inputs | Category C analysis | Would need alternative approach (input preprocessing) |
| A2 | `_inlinedQrl` variant exists in addition to `inlinedQrl` | inlinedQrl detection | Minor -- check Rust source for exact name matching |

## Open Questions

1. **Parse error recovery strategy for example_3 and example_immutable_analysis**
   - What we know: oxc-parser returns empty body for both inputs; SWC recovers
   - What's unclear: Whether input preprocessing is reliable enough or if a different approach is needed
   - Recommendation: Try targeted input repair first; if too fragile, check if oxc has recovery options we're missing or file upstream issue

2. **Scope of `inlinedQrl` support needed**
   - What we know: 2 snapshots use it; Rust has dedicated `handle_inlined_qsegment()`
   - What's unclear: How many other snapshots in later phases also use `inlinedQrl`
   - Recommendation: Build a general `inlinedQrl` extraction handler; it will benefit later phases too

3. **`example_immutable_analysis` parse failure root cause**
   - What we know: The `[].map(() => (` in JSX children causes parse failure
   - What's unclear: Whether this is a JSX-specific parse issue or general syntax ambiguity
   - Recommendation: Investigate if wrapping in `{...}` during preprocessing would fix it

## Sources

### Primary (HIGH confidence)
- [Rust transform.rs on GitHub](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) - Marker detection, inlinedQrl handling
- [Rust collector.rs on GitHub](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/collector.rs) - Import collection (all sources, not just Qwik)
- Local codebase investigation: `src/optimizer/marker-detection.ts`, `src/optimizer/extract.ts`, `src/optimizer/transform.ts`
- Local diagnostic runs: Confirmed zero extractions for all 11 snapshots with root cause identification

### Secondary (MEDIUM confidence)
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) - Error recovery documentation
- [oxc parser architecture docs](https://oxc.rs/docs/learn/architecture/parser) - Partial recovery behavior

## Metadata

**Confidence breakdown:**
- Root causes 1-2 (marker detection): HIGH - verified against Rust source and local diagnostics
- Root cause 3 (parse errors): HIGH for diagnosis, MEDIUM for fix approach
- Root cause 4 (inlinedQrl): HIGH - verified pattern exists in Rust source
- Fix approaches: MEDIUM - implementation details need validation during development

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, no library changes expected)
