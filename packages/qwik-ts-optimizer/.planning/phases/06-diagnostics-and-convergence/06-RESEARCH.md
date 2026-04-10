# Phase 6: Diagnostics and Convergence - Research

**Researched:** 2026-04-10
**Domain:** Optimizer diagnostics, snapshot convergence, edge case fixes
**Confidence:** HIGH

## Summary

Phase 6 has two distinct workstreams: (1) implementing diagnostic emission for invalid code patterns (C02, C03, C05) plus the `@qwik-disable-next-line` suppression directive, and (2) convergence -- making all ~209 snapshot tests pass.

The diagnostics work is well-scoped: only 5 snapshot files contain non-empty diagnostics (3 with errors, 2 with warnings). The diagnostic type format in snapshots uses `category` (not `severity`) and includes a `scope` field -- both differ from the current `Diagnostic` type in `types.ts`. The `@qwik-disable-next-line` directive does NOT appear in the current Qwik Rust optimizer source (confirmed via code inspection) but IS expected by 4 snapshot files, meaning our TS optimizer introduces this feature.

The convergence work is the larger challenge. A full audit shows only **2 out of 209** snapshots currently pass when run through `transformModule()`. Of the 207 failures: 182 fail at the parent module level and 24 fail only at the segment level. Root causes fall into several categories that must be systematically addressed.

**Primary recommendation:** Implement diagnostics first (small, well-defined scope), then systematically fix convergence by category -- starting with the most impactful root causes that fix the largest number of snapshots at once.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIAG-01 | Emit C02 FunctionReference error for functions/classes crossing $() boundary | Snapshot `example_capturing_fn_class.snap` shows exact format; Rust source confirms IdentType::Fn/Class partition logic |
| DIAG-02 | Emit C03 CanNotCapture error for invalid captures | Snapshot `should_disable_multiple_rules_from_single_directive.snap` shows format; triggered when $() arg is not arrow/function but captures locals |
| DIAG-03 | Emit C05 MissingQrlImplementation error | Snapshot `example_missing_custom_inlined_functions.snap` shows format; triggered when `foo$` exists but `fooQrl` is not exported in same file |
| DIAG-04 | Support @qwik-disable-next-line comment directive | 4 snapshot files test this; directive appears in JSX comments `{/* @qwik-disable-next-line CODE */}` and block comments `/* @qwik-disable-next-line CODE */` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **API compatibility**: Drop-in replacement for NAPI module
- **Hash stability**: Same algorithm as SWC optimizer
- **Runtime correctness**: Output must produce working Qwik apps
- Stack: oxc-parser, oxc-walker, magic-string, vitest (no Babel)
- No dead code elimination (bundler handles DCE downstream)
- No source map byte-offset matching
- AST comparison for snapshots, not string identity

## Diagnostic Format Analysis

### Snapshot Diagnostic Format vs Current Types

The snapshot `.snap` files use a diagnostic format that **differs** from the current `Diagnostic` interface in `types.ts`: [VERIFIED: snapshot file inspection]

**Snapshot format** (from `example_capturing_fn_class.snap`):
```json
{
  "category": "error",
  "code": "C02",
  "file": "test.tsx",
  "message": "Reference to identifier 'hola' can not be used inside a Qrl($) scope because it's a function",
  "highlights": null,
  "suggestions": null,
  "scope": "optimizer"
}
```

**Current `Diagnostic` type** (from `types.ts`):
```typescript
interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file: string;
  highlights: DiagnosticHighlight[];
}
```

**Differences to reconcile:**
| Field | Snapshot | Current Type | Action |
|-------|----------|-------------|--------|
| category/severity | `"category": "error"` | `severity: 'error'` | Rename field or add mapping in snapshot comparison |
| scope | `"scope": "optimizer"` | Not present | Add to type or ignore in comparison |
| highlights | `null` or array of `{lo, hi, startLine, startCol, endLine, endCol}` | `DiagnosticHighlight[]` with `SourceLocation` | Different shape -- snapshot uses flat object, type uses nested `loc` |
| suggestions | `null` | Not present | Add to type or ignore |

**Decision needed:** Either update the `Diagnostic` type to match snapshot format or handle mapping in the snapshot comparison utility. [ASSUMED]

### C02: FunctionReference

**Trigger:** When a captured identifier inside a `$()` scope was declared as a `function` or `class` in an enclosing scope. [VERIFIED: Rust source transform.rs]

**Logic:**
1. During segment extraction, partition declarations in the enclosing scope(s) into variables vs functions/classes
2. When computing captures for a segment, check if any captured identifier is a function or class declaration
3. If so, emit C02 for each such identifier

**Message format:** `"Reference to identifier '{name}' can not be used inside a Qrl($) scope because it's a function"` [VERIFIED: snapshot]

**Highlights:** `null` (no highlight location) [VERIFIED: snapshot]

**Example** (`example_capturing_fn_class.snap`):
- Input has `function hola(){}` and `class Thing {}` declared in component body
- Inner `$()` scope references `hola()` and `new Thing()`
- Two C02 errors emitted, one for each identifier
- Note: `class Other {}` is declared but NOT referenced in the `$()` scope, so no error for it
- The transform still produces output (diagnostics don't prevent code generation)

### C03: CanNotCapture

**Trigger:** When a `$()` call's first argument is NOT a function/arrow expression but captures local identifiers. [VERIFIED: Rust source]

**Logic:**
1. Check if the first argument to `$()` is an ArrowFunctionExpression or FunctionExpression
2. If it's some other expression (identifier, template literal, etc.) AND it references local scope variables
3. Emit C03

**Message format:** `"Qrl($) scope is not a function, but it's capturing local identifiers: {comma-separated names}"` [VERIFIED: snapshot]

**Highlights:** Has location data pointing to the expression span (`lo`, `hi`, `startLine`, `startCol`, `endLine`, `endCol`) [VERIFIED: snapshot]

**Example** (`should_disable_multiple_rules_from_single_directive.snap`):
- `useMemo$` is a custom inlined function with `(qrl) => { useEffect(qrl); }`
- The `useTask$` call inside receives `qrl` (a parameter) as its argument via the `useMemo$` wrapper
- The extracted segment `useMemo_useTask_505mjFKN4to` is just `qrl` -- an identifier, not a function
- Error: captures local `qrl` but is not a function expression

### C05: MissingQrlImplementation

**Trigger:** When a custom `$`-suffixed function is called (e.g., `useMemo$`) but the corresponding `Qrl`-suffixed version (e.g., `useMemoQrl`) is not exported in the same file. [VERIFIED: Rust source + snapshot]

**Logic:**
1. When a custom inlined function `foo$` is detected (not a known Qwik core function)
2. Look for an export named `fooQrl` in the module
3. If not found, emit C05

**Message format:** `"Found '{name}$' but did not find the corresponding '{name}Qrl' exported in the same file. Please check that it is exported and spelled correctly"` [VERIFIED: snapshot]

**Highlights:** Has location data pointing to the `$()` argument span [VERIFIED: snapshot]

### preventdefault-passive-check Warning

**Trigger:** When a JSX element has both `passive:eventName` and `preventdefault:eventName` attributes (contradictory -- passive handlers cannot call preventDefault). [VERIFIED: snapshot]

**Message format:** `"preventdefault:{event} has no effect when passive:{event} is also set; passive event listeners cannot call preventDefault()"` [VERIFIED: snapshot]

**Code:** `"preventdefault-passive-check"` [VERIFIED: snapshot]

**Existing in snapshots:** 2 snapshots emit this warning.

### @qwik-disable-next-line Directive (DIAG-04)

**Behavior** (inferred from 4 snapshots): [VERIFIED: snapshot inspection]

1. A comment containing `@qwik-disable-next-line` followed by comma-separated codes
2. Suppresses diagnostics matching those codes on the NEXT line only
3. Works in JSX comments `{/* @qwik-disable-next-line CODE */}` and block comments `/* @qwik-disable-next-line CODE */`
4. Multiple codes can be comma-separated: `@qwik-disable-next-line C05, preventdefault-passive-check`
5. Only affects the immediately next line -- subsequent lines still get diagnostics

**4 test snapshots:**
| Snapshot | What it tests |
|----------|---------------|
| `should_disable_passive_warning_with_qwik_disable_next_line` | Suppresses `preventdefault-passive-check` on next line; first button (sync$) not suppressed |
| `should_disable_qwik_transform_error_by_code` | Suppresses C05 error on `useMemo$` call |
| `should_disable_multiple_rules_from_single_directive` | Single directive suppresses both `C05` and `preventdefault-passive-check` |
| `should_only_disable_the_next_line` | First line suppressed, second identical line still emits warning |

**Implementation approach:** Before emitting any diagnostic, check if the previous non-empty line has a `@qwik-disable-next-line` comment containing the diagnostic code. If so, suppress. [ASSUMED]

## Convergence Audit Results

### Current State: 2/209 Passing

A full audit running all 209 snapshots through `transformModule()` with inferred options shows: [VERIFIED: test execution]

| Category | Count | Notes |
|----------|-------|-------|
| Full pass | 2 | `issue_117.snap`, `special_jsx.snap` |
| Parent module fail | 182 | Parent code doesn't match expected |
| Segment-only fail | 24 | Parent matches but segments differ |
| Errors (crash) | 0 | No runtime errors |
| **Total** | **209** | |

### Root Causes of Parent Module Failures

Based on examination of several failing snapshots, parent failures cluster into these categories: [VERIFIED: code inspection + test output]

#### Category 1: Non-Qwik Import Retention
**Impact:** HIGH -- affects many snapshots
**Problem:** Our optimizer preserves all non-Qwik imports in the parent module. The Rust optimizer (with `minify=Simplify`) removes imports whose identifiers are no longer used in the parent after segment extraction.
**Example:** `example_dead_code.snap` -- `import { deps } from 'deps'` should be removed because `deps()` was only called inside a `if(false)` block that gets simplified away.
**Fix approach:** After extraction, scan which imports are still referenced in the parent module body. Remove unreferenced non-Qwik imports. This is NOT dead code elimination (which is out of scope) -- it's import cleanup after extraction moves code to segments.

#### Category 2: Missing transpileTs / transpileJsx Handling
**Impact:** HIGH -- nearly all snapshots in the Rust test suite use `transpile_ts=true` and/or `transpile_jsx=true`
**Problem:** The `transpileTs` and `transpileJsx` options are defined in `TransformModulesOptions` but not implemented. Many snapshots expect TypeScript types to be stripped and JSX to remain untranspiled (since our approach uses magic-string, JSX is preserved in .tsx segments).
**Note:** This may not be as impactful as it seems because (a) the AST comparison strips positions, and (b) the snapshot expected output often contains JSX for `.tsx` extension segments. Need to verify which failures are actually caused by TS type retention vs other issues.
**Fix approach:** Apply `oxc-transform` TypeScript stripping before extraction when `transpileTs` is not explicitly `false`.

#### Category 3: Missing explicitExtensions Option
**Impact:** MEDIUM -- ~20 snapshots use `explicit_extensions=true`
**Problem:** When `explicitExtensions` is true, import paths in QRL declarations should include the `.js` extension suffix. Currently import paths never include extensions.
**Example:** `example_class_name.snap` expects `import("./test.tsx_App2_component_3yveMqbQ3Fs.js")` but gets `import("./test.tsx_App2_component_3yveMqbQ3Fs")`.
**Fix approach:** Thread `explicitExtensions` option through to `buildQrlDeclaration` and segment codegen.

#### Category 4: Extraction Edge Cases
**Impact:** MEDIUM -- specific snapshots
**Problem:** Some inputs have `$()` calls inside non-exported arrow functions (e.g., `example_3.snap` where `component$` is called inside `const App = () => {...}`). The extraction pipeline may not find these if it only looks at top-level statements.
**Example:** `example_3.snap` -- `export const App = () => { const Header = component$(...); ... }` -- the `component$` call is nested inside an arrow function body.

#### Category 5: Missing minify/Simplify Mode
**Impact:** MEDIUM -- the Rust default is `minify=Simplify`
**Problem:** The Rust optimizer with `minify=Simplify` performs basic simplifications like removing `if(false){}` blocks, simplifying `true ? a : b` to `a`. Our optimizer doesn't do this.
**Note:** PROJECT.md says DCE is out of scope, but the Rust optimizer's simplify mode does some trivial simplifications that affect snapshot output.

#### Category 6: Missing preserveFilenames Option
**Impact:** LOW -- 2 snapshots
**Problem:** When `preserveFilenames` is true, the segment filename uses the original file stem instead of the hash-based canonical name.

#### Category 7: Snapshot Option Inference
**Impact:** META -- affects the convergence test infrastructure itself
**Problem:** Each snapshot was generated with specific options (transpile_ts, transpile_jsx, entry_strategy, explicit_extensions, is_server, strip_exports, strip_ctx_name, reg_ctx_name, etc.) but these options are NOT recorded in the snapshot file. They must be inferred from the snapshot name or looked up from the Rust test.rs source.
**Fix approach:** Build a comprehensive options map for all 209 snapshots based on the Rust test.rs configuration. This is critical infrastructure for convergence testing.

### Segment-Only Failures (24 snapshots)

These pass parent comparison but fail segment comparison. Common causes: [VERIFIED: test output]
- Metadata field mismatches (captures, paramNames, captureNames)
- Missing JSX transform in segment bodies (spread props, specific prop classification)
- Self-referential QRL patterns
- Windows path handling (`support_windows_paths.snap`)

## Architecture Patterns

### Diagnostic Emission Pattern

Diagnostics should be accumulated during the transform pipeline and returned in the `TransformOutput.diagnostics` array. They should NOT prevent code generation -- the Rust optimizer emits diagnostics AND produces valid output simultaneously.

```
transformModule()
  -> extractSegments() -- detect C02, C05 conditions
  -> capture analysis -- detect C03 conditions
  -> JSX transform -- detect preventdefault-passive-check
  -> filter diagnostics through @qwik-disable-next-line
  -> return { modules, diagnostics, ... }
```

### Convergence Test Pattern

The convergence test should use a comprehensive options map:

```typescript
// Map each snapshot name to its exact transform options
const SNAPSHOT_OPTIONS: Record<string, Partial<TransformModulesOptions>> = {
  'example_1': { /* default */ },
  'example_10': { /* filename: "project/test.tsx" */ },
  'example_11': { entryStrategy: { type: 'single' }, explicitExtensions: true },
  // ... 206 more entries
};
```

### Recommended Convergence Order

1. **Infrastructure** (highest leverage): Build comprehensive options map from Rust test.rs
2. **Import cleanup**: Remove unused non-Qwik imports from parent modules after extraction
3. **explicitExtensions**: Thread option through QRL generation
4. **TS stripping**: Apply oxc-transform when transpileTs is enabled
5. **Extraction edge cases**: Handle $() inside non-exported function bodies
6. **Segment fixes**: Address the 24 segment-only failures
7. **Diagnostics**: C02, C03, C05, preventdefault-passive-check
8. **@qwik-disable-next-line**: Comment directive parsing and suppression
9. **Tail fixes**: Remaining individual snapshot edge cases

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TS type stripping | Custom type removal | oxc-transform | Already in stack, handles all TS syntax correctly |
| Comment parsing | Custom parser for `@qwik-disable-next-line` | Simple regex on source text | The directive format is simple enough; AST comment APIs vary |
| Unused import detection | Full tree-shaking | Post-extraction reference scan | Only need to check which imported names appear in remaining parent code |

## Common Pitfalls

### Pitfall 1: Diagnostic Type Mismatch
**What goes wrong:** Snapshot comparison fails because diagnostic fields don't match
**Why it happens:** Snapshot format uses `category`/`scope`/flat highlights; our type uses `severity`/no scope/nested SourceLocation
**How to avoid:** Update the snapshot diagnostic comparison to map between formats, or update the Diagnostic type to match snapshot format
**Warning signs:** Diagnostics "pass" in unit tests but fail in snapshot comparison

### Pitfall 2: Convergence Option Misattribution
**What goes wrong:** Snapshot fails because wrong options were passed, not because of a code bug
**Why it happens:** Each snapshot has specific options not recorded in the file
**How to avoid:** Build the options map FIRST from the Rust test.rs source and validate it
**Warning signs:** A snapshot alternates between passing and failing depending on option tweaks

### Pitfall 3: Import Ordering Sensitivity
**What goes wrong:** Parent module passes semantic comparison but actual import order differs
**Why it happens:** AST comparison doesn't care about import order, but if imports are structurally different (not just reordered) it fails
**How to avoid:** Ensure added Qwik imports go at the top (matching Rust output placement)

### Pitfall 4: Diagnostics Prevent Code Generation
**What goes wrong:** When a diagnostic condition is detected, the code path short-circuits and doesn't generate output
**Why it happens:** Natural instinct is to treat errors as fatal
**How to avoid:** The Rust optimizer always generates output AND diagnostics. Snapshot files with non-empty diagnostics ALSO have valid output code. Diagnostics are informational, not blocking.

### Pitfall 5: @qwik-disable-next-line Scope Creep
**What goes wrong:** Directive suppresses too many or too few diagnostics
**Why it happens:** "Next line" semantics are ambiguous with JSX, multi-line expressions
**How to avoid:** The directive suppresses diagnostics whose trigger is on the NEXT source line after the comment. Use line numbers from the original source, not transformed output.

## Code Examples

### C02 Detection Pattern
```typescript
// During capture analysis, check declaration type
// Source: Rust transform.rs partition logic [VERIFIED]
function classifyDeclaration(node: any): 'var' | 'fn' | 'class' {
  if (node.type === 'FunctionDeclaration') return 'fn';
  if (node.type === 'ClassDeclaration') return 'class';
  return 'var';
}

// When a captured identifier is fn/class, emit C02
if (declType === 'fn' || declType === 'class') {
  diagnostics.push({
    severity: 'error',
    code: 'C02',
    message: `Reference to identifier '${name}' can not be used inside a Qrl($) scope because it's a function`,
    file: origin,
    highlights: [],
  });
}
```

### C05 Detection Pattern
```typescript
// When a custom $-suffixed function is detected but no Qrl export exists
// Source: Rust transform.rs new_specifier logic [VERIFIED]
const qrlName = calleeName.replace(/\$$/, 'Qrl');
const hasQrlExport = moduleExports.has(qrlName);
if (!hasQrlExport) {
  diagnostics.push({
    severity: 'error',
    code: 'C05',
    message: `Found '${calleeName}' but did not find the corresponding '${qrlName}' exported in the same file. Please check that it is exported and spelled correctly`,
    file: origin,
    highlights: [/* span of the $() argument */],
  });
}
```

### @qwik-disable-next-line Parsing
```typescript
// Parse source comments for disable directives
// Source: snapshot behavior analysis [VERIFIED: snapshot files]
const DISABLE_RE = /@qwik-disable-next-line\s+([\w\-,\s]+)/;

function parseDisableDirectives(sourceCode: string): Map<number, Set<string>> {
  const directives = new Map<number, Set<string>>();
  const lines = sourceCode.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(DISABLE_RE);
    if (match) {
      const codes = match[1].split(',').map(c => c.trim()).filter(Boolean);
      // Suppress codes on the NEXT line
      directives.set(i + 1, new Set(codes));
    }
  }
  return directives;
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | @qwik-disable-next-line is a NEW feature not in Rust source | Diagnostic Format | Low -- snapshots are authoritative regardless of Rust status |
| A2 | Convergence failures are mostly due to missing option handling, not fundamental extraction bugs | Convergence Audit | Medium -- if extraction itself is broken in many cases, the fix scope is larger |
| A3 | The Diagnostic type should be updated to match snapshot format rather than mapping in comparison | Diagnostic Format | Low -- either approach works |
| A4 | Import cleanup (removing unused non-Qwik imports) is not dead code elimination | Root Causes | Medium -- if PROJECT.md considers this DCE, approach changes |
| A5 | TS stripping with oxc-transform should be applied by default (matching Rust behavior) | Root Causes | Medium -- if transpileTs defaults differ, many snapshots stay broken |

## Open Questions

1. **Snapshot Options Map**
   - What we know: Each snapshot needs specific options from the Rust test.rs
   - What's unclear: The exact options for all 209 snapshots -- need systematic extraction
   - Recommendation: Parse the Rust test.rs file to build a complete options map

2. **Import Cleanup Scope**
   - What we know: Rust optimizer removes unused imports after extraction
   - What's unclear: Is this considered DCE (out of scope) or import cleanup (in scope)?
   - Recommendation: Treat as import cleanup -- it's a direct consequence of extraction, not general DCE

3. **Minify/Simplify Mode**
   - What we know: Rust default is `minify=Simplify` which removes `if(false){}` etc.
   - What's unclear: How many snapshot failures are caused specifically by missing simplification
   - Recommendation: Defer simplification to v2 unless it blocks many snapshots

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (or package.json) |
| Quick run command | `npx vitest run tests/optimizer/transform.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIAG-01 | C02 FunctionReference error | unit + snapshot | `npx vitest run tests/optimizer/diagnostics.test.ts -t "C02"` | Wave 0 |
| DIAG-02 | C03 CanNotCapture error | unit + snapshot | `npx vitest run tests/optimizer/diagnostics.test.ts -t "C03"` | Wave 0 |
| DIAG-03 | C05 MissingQrlImplementation error | unit + snapshot | `npx vitest run tests/optimizer/diagnostics.test.ts -t "C05"` | Wave 0 |
| DIAG-04 | @qwik-disable-next-line suppression | unit + snapshot | `npx vitest run tests/optimizer/diagnostics.test.ts -t "disable"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/diagnostics.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + all 209 snapshots pass via convergence test

### Wave 0 Gaps
- [ ] `tests/optimizer/diagnostics.test.ts` -- covers DIAG-01 through DIAG-04
- [ ] Convergence test with comprehensive options map -- covers all 209 snapshots

## Security Domain

Not applicable for this phase. The optimizer transforms source code at build time only -- no user input, no network access, no authentication. Security concerns are limited to correct code generation (covered by convergence testing).

## Sources

### Primary (HIGH confidence)
- Snapshot files in `match-these-snaps/` -- diagnostic format, expected output, test coverage
- `src/optimizer/types.ts` -- current Diagnostic type definition
- `src/optimizer/transform.ts` -- current transform pipeline (diagnostics array exists but empty)
- Convergence audit test execution -- 2/209 pass rate measured directly

### Secondary (MEDIUM confidence)
- [Qwik Rust transform.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) -- C02/C03/C05 trigger conditions
- [Qwik Rust errors.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/errors.rs) -- error code definitions
- [Qwik Rust test.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/test.rs) -- test configurations for each snapshot

### Tertiary (LOW confidence)
- @qwik-disable-next-line implementation details -- inferred from snapshot behavior, not from Rust source (feature not found in current Rust code)

## Metadata

**Confidence breakdown:**
- Diagnostics: HIGH - exact formats verified from snapshots, trigger conditions from Rust source
- Convergence audit: HIGH - measured directly via test execution
- Root cause analysis: MEDIUM - categories identified from sample inspection, proportions estimated
- @qwik-disable-next-line: MEDIUM - behavior inferred from snapshots, implementation approach assumed

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- snapshot corpus is fixed)
