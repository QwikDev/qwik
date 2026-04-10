# Phase 2: Core Extraction Pipeline - Research

**Researched:** 2026-04-10
**Domain:** AST traversal, segment extraction, QRL generation, import rewriting, magic-string code transformation
**Confidence:** HIGH

## Summary

Phase 2 builds the core optimizer: parse source files with oxc-parser, walk the AST with oxc-walker to find `$()` marker calls, extract segment closures into separate modules, rewrite the parent module to replace `$()` calls with QRL references, transform call forms (`component$` to `componentQrl`), rewrite legacy import paths (`@builder.io/qwik` to `@qwik.dev/core`), and expose a `transformModule()` API matching the existing NAPI binding interface.

The extraction algorithm has been reverse-engineered from 209 snapshot files and the Qwik Rust optimizer source (transform.rs). The core pattern is: (1) collect all imports and identify which are `$`-suffixed markers, (2) walk the AST maintaining a context stack for naming, (3) when a `$()` call is found, extract the first argument as a segment, (4) generate a QRL const declaration in the parent, (5) emit the segment as a separate module with its own imports. The parent module output follows a strict structure: imports at top, `//` separator, QRL const declarations, `//` separator, then the rewritten module body.

Capture analysis (CAPT-01 through CAPT-06) is Phase 3 scope. For Phase 2, segments with captures should emit `captures: true` in metadata and note capture names where determinable, but the `_captures` injection and `.w([...])` wrapping logic is deferred. Phase 2 focuses on the structural extraction, naming, and module rewriting.

**Primary recommendation:** Build bottom-up: (1) import rewriting module, (2) context stack + naming integration, (3) single-segment extraction, (4) call form rewriting, (5) parent module assembly, (6) multi-segment/nested extraction, (7) transformModule() API wrapper. Test each layer against snapshot corpus using the Phase 1 batch runner.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXTRACT-01 | Detect marker function calls (callee name ends with `$`) | Walk AST for CallExpression nodes, check callee Identifier/MemberExpression ends with `$`. Pattern confirmed from all 209 snapshots. |
| EXTRACT-02 | Extract closure argument from marker call as a segment | First argument of `$()` call becomes the exported segment body. Verified from snapshot input/output pairs. |
| EXTRACT-03 | Handle nested `$()` calls (parent-child relationships) | `parent` field in metadata links child segments to parent. Context stack accumulates through nesting. Confirmed from example_1, example_3 snapshots. |
| EXTRACT-04 | Generate segment module with exported const using deterministic name | `export const {symbolName} = {body}` format. symbolName from Phase 1 naming module (buildSymbolName). Verified in all segment blocks. |
| EXTRACT-05 | Rewrite parent module replacing `$()` calls with QRL references | Replace `$(() => ...)` with `q_{symbolName}` reference. QRL const declarations prepended to module body. Verified in all parent module blocks. |
| EXTRACT-06 | Handle custom inlined functions (user-defined `$`-suffixed functions) | If `useMemo$` is defined via `wrap(useMemoQrl)`, the call rewrites to `useMemoQrl(qrl_ref)`. If Qrl equivalent not found, emit C05 diagnostic. Verified from custom_inlined_functions and missing_custom_inlined_functions snapshots. |
| EXTRACT-07 | Emit segment metadata (all fields) | 13+ fields including origin, name, hash, displayName, parent, ctxKind, ctxName, captures, loc, paramNames, captureNames. Verified from snapshot metadata JSON blocks. |
| CALL-01 | Rewrite `component$` to `componentQrl` | Strip `$`, append `Qrl`. Import `componentQrl` from `@qwik.dev/core`. Add `/*#__PURE__*/` annotation. Verified in example_2, example_3, example_4 snapshots. |
| CALL-02 | Rewrite `useTask$`, `useVisibleTask$`, `useComputed$` to `*Qrl` forms | Same pattern: strip `$`, append `Qrl`. Import the Qrl variant. Verified in example_use_server_mount snapshot. |
| CALL-03 | Rewrite `server$` to `serverQrl` | Same `$` to `Qrl` pattern. Verified from example_server_auth snapshot. |
| CALL-04 | Handle `sync$` to `_qrlSync` with serialized function body string | sync$ does NOT extract a segment. Instead, wraps with `_qrlSync(fn, "stringified_fn")`. Verified from example_of_synchronous_qrl snapshot. |
| CALL-05 | Add `/*#__PURE__*/` annotations on QRL declarations and componentQrl calls | `/*#__PURE__*/` before `qrl()` calls and `componentQrl()` calls. Verified in all snapshot parent modules. |
| IMP-01 | Rewrite `@builder.io/qwik` to `@qwik.dev/core` | Direct string replacement in import source. Verified from rename_builder_io snapshot. |
| IMP-02 | Rewrite `@builder.io/qwik-city` to `@qwik.dev/router` | Including sub-paths: `@builder.io/qwik-city/more/here` -> `@qwik.dev/router/more/here`. Verified from rename_builder_io snapshot. |
| IMP-03 | Rewrite `@builder.io/qwik-react` to `@qwik.dev/react` | Direct replacement. Verified from rename_builder_io snapshot. |
| IMP-04 | Add necessary imports to parent module (qrl, componentQrl, etc.) | Parent gets `import { qrl } from "@qwik.dev/core"` plus any Qrl variants used. Each import is a separate statement. Verified in all parent modules. |
| IMP-05 | Add necessary imports to segment modules | Segments import only what they reference: `qrl` if they have nested QRLs, original imports that the segment body uses. Verified from example_capture_imports, example_use_server_mount. |
| IMP-06 | Deduplicate imports | Don't re-import already-imported symbols. Verified: no duplicate imports in any snapshot output. |
| API-01 | Export `transformModule()` function matching NAPI binding | `TransformModulesOptions` input, `TransformOutput` output. Types extracted from Qwik types.ts. |
| API-02 | Return transformed parent module, segments array, diagnostics | `TransformOutput { modules: TransformModule[], diagnostics: Diagnostic[], isTypeScript, isJsx }`. Verified from types.ts. |
| API-03 | Accept options: filename, entryStrategy, mode, isServer, etc. | `TransformOptions` interface with srcDir, rootDir, entryStrategy, mode, scope, stripExports, etc. Verified from types.ts. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| oxc-parser | 0.124.0 | Parse TS/TSX/JS/JSX to ESTree AST | Already installed, native Rust NAPI, ESTree-conformant [VERIFIED: npm registry] |
| oxc-walker | 0.7.0 | AST traversal with ScopeTracker | ScopeTracker for declaration/reference tracking, walk() with enter/leave [VERIFIED: npm registry, was 0.6.0 in CLAUDE.md but 0.7.0 is latest] |
| oxc-transform | 0.124.0 | Strip TypeScript syntax from segment output | Native Rust, same oxc ecosystem [VERIFIED: npm registry] |
| magic-string | 0.30.21 | Surgical source text replacement for parent module rewriting | Avoids full AST-to-code reprint; preserves original formatting where possible [VERIFIED: npm registry] |
| siphash | 1.1.0 | SipHash-1-3 for deterministic symbol hashes | Already installed from Phase 1 [VERIFIED: installed] |
| pathe | 2.0.3 | Cross-platform path normalization | Already installed from Phase 1 [VERIFIED: installed] |

### Supporting (Phase 1 -- already built)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.4 | Test runner | All tests [VERIFIED: installed] |
| fast-deep-equal | 3.1.3 | Deep equality for AST comparison | Test assertions [VERIFIED: installed] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| magic-string | astring/escodegen | These reprint from AST (lossy formatting); magic-string preserves original text |
| oxc-walker | estree-walker directly | oxc-walker wraps estree-walker and adds ScopeTracker which we need for capture detection |
| Manual string building for segments | magic-string for segments too | Segment modules are generated from scratch, not edited. String concatenation is simpler and sufficient. |

**Installation (new dependencies for Phase 2):**
```bash
npm install magic-string
npm install -D oxc-walker oxc-transform
```

**Version verification:** All versions confirmed via `npm view <pkg> version` on 2026-04-10. Note: oxc-walker is 0.7.0, not 0.6.0 as listed in CLAUDE.md. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```
src/
  optimizer/
    transform.ts           # Main transformModule() entry point (API-01, API-02, API-03)
    extract.ts             # Segment extraction logic (EXTRACT-01 through EXTRACT-07)
    rewrite-parent.ts      # Parent module rewriting with magic-string (EXTRACT-05)
    rewrite-calls.ts       # Call form rewrites: component$ -> componentQrl (CALL-01 through CALL-05)
    rewrite-imports.ts     # Import path rewrites and import management (IMP-01 through IMP-06)
    context-stack.ts       # Context stack management for naming (integrates Phase 1 naming)
    segment-codegen.ts     # Generate segment module source code (EXTRACT-04)
    types.ts               # TransformModulesOptions, TransformOutput, etc. (API-01, API-03)
  hashing/                 # (Phase 1 -- existing)
    siphash.ts
    naming.ts
  testing/                 # (Phase 1 -- existing)
    snapshot-parser.ts
    ast-compare.ts
    metadata-compare.ts
    batch-runner.ts
tests/
  optimizer/
    extract.test.ts
    rewrite-calls.test.ts
    rewrite-imports.test.ts
    context-stack.test.ts
    transform.test.ts      # Integration tests using snapshot batch runner
```

### Pattern 1: Marker Function Detection (EXTRACT-01)

**What:** Any CallExpression where the callee name ends with `$` is a marker function. This includes:
- Direct calls: `$(() => ...)`, `component$(() => ...)`, `useTask$(async () => ...)`
- Named imports from `@qwik.dev/core` or `@builder.io/qwik`
- Custom user-defined `$`-suffixed functions (e.g., `useMemo$` created via `wrap()`)

**Detection algorithm:** [VERIFIED: all 209 snapshots confirm this pattern]
```typescript
function isMarkerCall(node: CallExpression, imports: Map<string, ImportInfo>): boolean {
  if (node.callee.type === 'Identifier') {
    const name = node.callee.name;
    // Check if the identifier ends with $ AND is a known marker
    // (imported from qwik core, or user-defined via wrap())
    return name.endsWith('$') && isKnownMarker(name, imports);
  }
  return false;
}
```

**Key insight:** Not ALL `$`-suffixed calls are markers. Only those imported from `@qwik.dev/core` (or `@builder.io/qwik`) OR those that have a corresponding `Qrl` export in the same file (custom inlined functions). If no `Qrl` variant exists, emit C05 diagnostic. [VERIFIED: example_missing_custom_inlined_functions snapshot]

### Pattern 2: Parent Module Output Structure

**What:** The rewritten parent module follows a strict structure observed in ALL 209 snapshots:

```
[optimizer-added imports]          # import { qrl } from "@qwik.dev/core"
[original non-marker imports]      # import { useStore } from "@qwik.dev/core"  
//                                 # separator comment
[QRL const declarations]           # const q_Name_hash = /*#__PURE__*/ qrl(()=>import("./..."), "...")
//                                 # separator comment  
[rewritten module body]            # export const App = /*#__PURE__*/ componentQrl(q_...)
```

**QRL const declaration format:** [VERIFIED: all snapshot parent modules]
```typescript
const q_{symbolName} = /*#__PURE__*/ qrl(()=>import("./{canonicalFilename}"), "{symbolName}");
```

**Important observations:**
- Each optimizer-added import is a SEPARATE `import { X } from "@qwik.dev/core"` statement (not combined) [VERIFIED: all snapshots]
- Original imports that aren't marker functions are preserved but may have their source rewritten
- The `q_` prefix on QRL const names [VERIFIED: all snapshots]
- QRL declarations are alphabetically sorted [VERIFIED: example_1, example_use_server_mount]
- The `//` separator comments are literal single-line comments on their own line

### Pattern 3: Segment Module Output Structure

**What:** Each extracted segment becomes a separate module with this structure:

```
[imports needed by segment]        # Only what this segment references
//                                 # separator (if imports present)
export const {symbolName} = {extractedExpression};
```

**Key observations from snapshots:** [VERIFIED: all 209 snapshots]
- Arrow functions: `export const Name_hash = () => { ... };`
- Non-function expressions: `export const Bar_GXXnVUtURSw = "a thing";` (rename_builder_io snapshot)
- Template literals: `export const Name_hash = \`...\`;` (example_capture_imports)
- Identifier references: `export const Name_hash = css3;` (example_capture_imports)
- Nested QRLs within segments get their own QRL const declarations (example_1, example_2)
- Segment imports include only what the segment body references (not the full parent imports)

### Pattern 4: Call Form Rewriting (CALL-01 through CALL-03)

**What:** `$`-suffixed function calls are rewritten to their `Qrl` equivalents.

**Algorithm:** Strip trailing `$`, append `Qrl`. [VERIFIED: all snapshots]

| Original | Rewritten | Import Added |
|----------|-----------|-------------|
| `component$(() => ...)` | `componentQrl(q_ref)` | `componentQrl` from `@qwik.dev/core` |
| `useTask$(async () => ...)` | `useTaskQrl(q_ref)` | `useTaskQrl` from `@qwik.dev/core` |
| `useStyles$(\`...\`)` | `useStylesQrl(q_ref)` | `useStylesQrl` from `@qwik.dev/core` |
| `qwikify$(Component)` | `qwikifyQrl(q_ref)` | `qwikifyQrl` from `@qwik.dev/react` |
| `$(() => ...)` | `q_ref` (bare QRL reference, no wrapper) | `qrl` from `@qwik.dev/core` |

**The bare `$()` case is special:** When the callee is literally just `$`, the call is replaced directly with the QRL reference (no wrapping function). All other `X$()` calls become `XQrl(q_ref)`. [VERIFIED: example_1 -- `$(() => ...)` becomes `q_renderHeader1_jMxQsjbyDss`, while `component$(() => ...)` becomes `componentQrl(q_...)`]

**PURE annotations:** `/*#__PURE__*/` is added before:
- `qrl()` calls in QRL const declarations
- `componentQrl()` calls
- NOT on `useTaskQrl()`, `useStylesQrl()`, etc.
[VERIFIED: all snapshots consistently show this pattern]

### Pattern 5: Context Stack for Naming (EXTRACT-07)

**What:** The context stack tracks the naming hierarchy as the AST is traversed. This determines the display name and symbol name for each segment.

**Stack push rules** (from Phase 1 research + snapshot verification): [VERIFIED: snapshots]
- Variable declaration name: `const Foo = ...` pushes `"Foo"`
- Function declaration name: `function App() {}` pushes `"App"`
- Property/method name: `{ onClick: ... }` pushes `"onClick"`
- JSX element tag: `<div ...>` pushes `"div"`
- JSX attribute name: `onClick$={...}` pushes `"onClick$"` (but only for `$`-suffixed attrs)
- Export default without name: pushes file stem (e.g., `"test"` or `"slug"` for `[[...slug]].tsx`)

**Example traces:** [VERIFIED: snapshots]
- `export const Header = component$(() => { ... onClick={$((ctx) => ...)} })`:
  - component$ segment: stack = `["Header", "component$"]` -> displayName = `"test.tsx_Header_component"`
  - onClick$ segment: stack = `["Header", "component$", "div", "onClick$"]` -> but escaping `$` gives `"Header_component_div_onClick"` -> displayName = `"test.tsx_Header_component_div_onClick"`

**ctxKind determination:** [VERIFIED: snapshot metadata]
- `"function"` for most cases: `component$`, `useTask$`, bare `$`, `useStyles$`, custom functions
- `"eventHandler"` for JSX event handler attributes: `onClick$`, `onChange$`, etc.

**ctxName values:** [VERIFIED: snapshot metadata]
- For regular `$()` calls: `ctxName = "$"`
- For `component$()`: `ctxName = "component$"`
- For `useTask$()`: `ctxName = "useTask$"`
- For JSX event handlers (onClick$ attr): `ctxName = "onClick$"`

### Pattern 6: Import Path Rewriting (IMP-01 through IMP-03)

**What:** Legacy `@builder.io/*` imports are rewritten to `@qwik.dev/*`. [VERIFIED: rename_builder_io snapshot]

| Old Path | New Path |
|----------|----------|
| `@builder.io/qwik` | `@qwik.dev/core` |
| `@builder.io/qwik/build` | `@qwik.dev/core/build` |
| `@builder.io/qwik/jsx-runtime` | `@qwik.dev/core/jsx-runtime` |
| `@builder.io/qwik/jsx-dev-runtime` | `@qwik.dev/core/jsx-dev-runtime` |
| `@builder.io/qwik-city` | `@qwik.dev/router` |
| `@builder.io/qwik-city/more/here` | `@qwik.dev/router/more/here` |
| `@builder.io/qwik-react` | `@qwik.dev/react` |
| `@builder.io/sdk` | NO REWRITE (not a qwik package) |

**Sub-path preservation:** After the base package is replaced, any sub-path is preserved. [VERIFIED: rename_builder_io snapshot shows `@builder.io/qwik-city/more/here` -> `@qwik.dev/router/more/here` and `@builder.io/qwik/build` -> `@qwik.dev/core/build`]

### Pattern 7: sync$ Handling (CALL-04)

**What:** `sync$` is NOT extracted as a segment. It is transformed inline to `_qrlSync(fn, "stringifiedFn")`. [VERIFIED: example_of_synchronous_qrl snapshot]

```typescript
// Input:
sync$(function(event, target) { event.preventDefault(); })

// Output:
_qrlSync(function(event, target) {
    // comment should be removed
    event.preventDefault();
}, "function(event,target){event.preventDefault();}")
```

**Key details:**
- The function body is serialized to a minified string (no comments, no whitespace)
- Both function declarations and arrow functions are supported
- Import `_qrlSync` from `@qwik.dev/core`
- The original function is preserved in the first argument (with comments intact in the AST output)

### Pattern 8: Extension Determination

**What:** Segment file extension depends on content. [VERIFIED: snapshot corpus analysis]

| Condition | Extension |
|-----------|-----------|
| Segment body contains JSX | `.tsx` |
| Source file is `.tsx` but segment has no JSX | `.js` |
| Source file is `.ts` (no JSX anywhere) | `.ts` |
| Source file is `.js` | `.js` |

**Evidence:** In example_1.snap, the renderHeader1 segment (which has `<div>` JSX) gets `.tsx`, while in example_custom_inlined_functions.snap, segments without JSX get `.js`. In rename_builder_io.snap, segments from a file with no JSX at all get `.ts`. [VERIFIED: snapshot corpus]

### Pattern 9: Custom Inlined Functions (EXTRACT-06)

**What:** Users can define their own `$`-suffixed functions using the `wrap()` pattern.

```typescript
// Definition:
export const useMemoQrl = (qrt) => { useEffect(qrt); };
export const useMemo$ = wrap(useMemoQrl);

// Usage -- gets rewritten:
useMemo$(() => { ... })
// Becomes:
useMemoQrl(q_ref)
```

**Detection:** The optimizer needs to find `export const XQrl = ...` and `export const X$ = wrap(XQrl)` pairs. When `X$` is called, it rewrites to `XQrl(qrl_ref)`.

**Missing Qrl variant:** If `X$` is called but no `XQrl` is found as an export in the same file, emit a C05 diagnostic. [VERIFIED: example_missing_custom_inlined_functions snapshot]

### Anti-Patterns to Avoid

- **Full AST codegen for parent module:** Do NOT reprint the parent module from AST. Use magic-string for surgical text replacement. AST reprinting loses formatting, comments, and whitespace.
- **String replacement without AST:** Do NOT use regex or string matching to find `$()` calls. The AST is the only reliable way to handle nested expressions, string literals containing `$`, etc.
- **Combining all imports into one statement:** Each optimizer-added import should be a separate statement (`import { qrl } from "..."`, `import { componentQrl } from "..."`), not `import { qrl, componentQrl } from "..."`. This matches SWC output. [VERIFIED: all snapshots]
- **Building captures in Phase 2:** Capture analysis (CAPT-*) is Phase 3. Phase 2 should detect that captures exist (for metadata) but NOT inject `_captures` or `.w([...])`. Set `captures: true/false` in metadata based on whether the segment references outer-scope variables.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source text manipulation | AST-to-code printer | magic-string | Preserves original formatting, handles offset tracking |
| Scope tracking | Manual scope stack | oxc-walker ScopeTracker | Handles all JS scoping rules (let/const/var, function hoisting, etc.) |
| TypeScript stripping | Manual type removal | oxc-transform | Handles all TS syntax correctly, maintains positions |
| Hash computation | Custom implementation | Phase 1 siphash.ts + naming.ts | Already verified against 389/401 corpus hashes |
| ESTree AST parsing | Custom parser | oxc-parser | Industry-standard, handles all JS/TS/JSX edge cases |

**Key insight:** The magic-string approach means we edit the ORIGINAL source text, not an AST-reprinted version. This avoids the formatting divergence that killed the prior Rust rewrite attempt.

## Common Pitfalls

### Pitfall 1: magic-string Offset Tracking with Multiple Replacements
**What goes wrong:** After replacing one `$()` call with a QRL reference, the character offsets of subsequent `$()` calls in the same file are wrong.
**Why it happens:** magic-string tracks offsets internally, but you must use the ORIGINAL source positions (from the AST), not positions in the already-modified string.
**How to avoid:** magic-string handles this correctly as long as you always reference original source positions. Never compute offsets from a partially-modified string. Use `node.start` and `node.end` from the parsed AST directly.
**Warning signs:** Second or third segment in a file gets wrong code extracted, or parent module has garbled text.

### Pitfall 2: oxc-parser Position Accuracy After TS Stripping
**What goes wrong:** If you strip TypeScript annotations before finding `$()` boundaries, the AST positions no longer match the original source text.
**Why it happens:** oxc-transform changes the source text (removes type annotations), shifting character positions.
**How to avoid:** Parse the ORIGINAL source (with types) for extraction. Use oxc-transform ONLY when generating final segment code that needs type annotations removed. The extraction pass must work on the original positions. [ASSUMED]
**Warning signs:** magic-string replacements are off by varying amounts, especially near type annotations.

### Pitfall 3: The `$` as Bare Function vs `component$` Pattern
**What goes wrong:** Treating bare `$()` the same as `component$()` in the parent module rewrite.
**Why it happens:** Bare `$()` is replaced by the QRL reference directly (`q_name`), while `component$()` is replaced by `componentQrl(q_name)`. Both extract segments the same way, but the parent rewrite differs.
**How to avoid:** Check if the callee is literally `$` vs `somethingElse$`. For bare `$`, the entire call expression is replaced with the QRL ref. For `X$()`, only the callee changes to `XQrl` and the argument is replaced with the QRL ref.
**Warning signs:** Output like `$(q_ref)` instead of just `q_ref`, or `componentQrl(q_ref)` appearing correctly but bare `$` being handled wrong.

### Pitfall 4: Separate Import Statements
**What goes wrong:** Combining optimizer-added imports into a single statement.
**Why it happens:** It seems more efficient to write `import { qrl, componentQrl } from "@qwik.dev/core"`.
**How to avoid:** Each new import must be a separate statement. The SWC optimizer emits them separately, and our AST comparison tests will fail if they're combined.
**Warning signs:** AST comparison fails on import declarations.

### Pitfall 5: Event Handler ctxKind vs Function ctxKind
**What goes wrong:** All segments get `ctxKind: "function"` when some should be `"eventHandler"`.
**Why it happens:** Not distinguishing between `$()` calls in JSX event attributes vs regular `$()` calls.
**How to avoid:** When the `$()` call is inside a JSX attribute whose name starts with `on` (like `onClick$`), set `ctxKind: "eventHandler"`. All other contexts use `"function"`.
**Warning signs:** Metadata comparison fails on ctxKind field.

### Pitfall 6: Context Stack for Default Exports
**What goes wrong:** Default exported components get wrong display names.
**Why it happens:** `export default component$(...)` has no variable name to push onto the context stack.
**How to avoid:** For default exports, push the file stem (without extension, with special character handling for bracket-style route names). E.g., `[[...slug]].tsx` -> push `"slug"`. [VERIFIED: example_default_export snapshot shows `slug_component` naming]
**Warning signs:** Display name or hash mismatch for default export components.

### Pitfall 7: Custom Inlined Function Detection
**What goes wrong:** `useMemo$(() => ...)` is not extracted because the optimizer doesn't recognize it as a marker.
**Why it happens:** `useMemo$` is not imported from `@qwik.dev/core` -- it's defined in the same file via `wrap()`.
**How to avoid:** Scan the module for `export const X$ = wrap(XQrl)` patterns during the global collection pass. Register these as markers. When `X$` is called, rewrite to `XQrl(qrl_ref)`.
**Warning signs:** Custom `$`-suffixed functions are left as-is in the output instead of being extracted.

### Pitfall 8: Segment Extension Determination
**What goes wrong:** All segments get `.tsx` extension regardless of content.
**Why it happens:** Using the source file extension for all segments.
**How to avoid:** Check if the extracted segment body contains JSX nodes. If yes, use `.tsx`. If the source is `.ts` with no JSX anywhere, use `.ts`. Otherwise use `.js`. The extension affects the segment filename in the import path.
**Warning signs:** Extension field in metadata doesn't match snapshot expected values.

## Code Examples

### magic-string Parent Module Rewriting
```typescript
// Source: magic-string API [VERIFIED: npm docs]
import MagicString from 'magic-string';

function rewriteParentModule(
  source: string,
  extractions: ExtractionResult[]
): string {
  const s = new MagicString(source);
  
  // Replace each $() call site with QRL reference
  for (const ext of extractions) {
    if (ext.isBare$) {
      // Bare $(): replace entire call with QRL ref
      s.overwrite(ext.callStart, ext.callEnd, `q_${ext.symbolName}`);
    } else {
      // X$(): replace callee with XQrl, replace arg with QRL ref
      s.overwrite(ext.calleeStart, ext.calleeEnd, ext.qrlCallee);
      s.overwrite(ext.argStart, ext.argEnd, `q_${ext.symbolName}`);
    }
  }
  
  // Remove $-function imports, add Qrl imports
  // ... import manipulation ...
  
  // Prepend QRL declarations and imports
  const imports = generateImports(extractions);
  const qrlDecls = generateQrlDeclarations(extractions);
  
  s.prepend(`${imports}\n//\n${qrlDecls}\n//\n`);
  
  return s.toString();
}
```

### oxc-walker AST Traversal for Extraction
```typescript
// Source: oxc-walker API [VERIFIED: npm docs + GitHub README]
import { parseSync } from 'oxc-parser';
import { walk, ScopeTracker } from 'oxc-walker';

function findMarkerCalls(source: string, filename: string) {
  const { program } = parseSync(filename, source);
  const scopeTracker = new ScopeTracker();
  const contextStack: string[] = [];
  const extractions: ExtractionInfo[] = [];
  
  walk(program, {
    scopeTracker,
    enter(node, parent) {
      // Push context for naming
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        contextStack.push(node.id.name);
      }
      if (node.type === 'FunctionDeclaration' && node.id) {
        contextStack.push(node.id.name);
      }
      
      // Detect marker calls
      if (node.type === 'CallExpression' && isMarkerCallee(node.callee)) {
        const arg = node.arguments[0];
        if (arg) {
          extractions.push({
            callNode: node,
            argNode: arg,
            contextStack: [...contextStack],
            // ... more metadata
          });
        }
      }
    },
    leave(node) {
      // Pop context
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        contextStack.pop();
      }
      if (node.type === 'FunctionDeclaration' && node.id) {
        contextStack.pop();
      }
    }
  });
  
  return extractions;
}
```

### Segment Module Code Generation
```typescript
// Source: Reverse-engineered from snapshot output [VERIFIED: 209 snapshots]
function generateSegmentModule(
  segment: SegmentInfo,
  nestedQrls: QrlDeclaration[],
  neededImports: ImportDeclaration[]
): string {
  const parts: string[] = [];
  
  // Add imports (each on separate line)
  for (const imp of neededImports) {
    parts.push(`import ${imp.specifier} from "${imp.source}";`);
  }
  
  // Separator
  if (neededImports.length > 0) {
    parts.push('//');
  }
  
  // Nested QRL declarations (if segment has nested $() calls)
  for (const qrl of nestedQrls) {
    parts.push(
      `const q_${qrl.symbolName} = /*#__PURE__*/ qrl(()=>import("./${qrl.canonicalFilename}"), "${qrl.symbolName}");`
    );
  }
  
  if (nestedQrls.length > 0) {
    parts.push('//');
  }
  
  // Exported segment body
  parts.push(`export const ${segment.symbolName} = ${segment.bodyCode};`);
  
  return parts.join('\n');
}
```

### Import Rewriting
```typescript
// Source: Reverse-engineered from rename_builder_io snapshot [VERIFIED: snapshot]
const IMPORT_REWRITES: [string, string][] = [
  ['@builder.io/qwik', '@qwik.dev/core'],
  ['@builder.io/qwik-city', '@qwik.dev/router'],
  ['@builder.io/qwik-react', '@qwik.dev/react'],
];

function rewriteImportSource(source: string): string {
  for (const [from, to] of IMPORT_REWRITES) {
    if (source === from || source.startsWith(from + '/')) {
      return to + source.slice(from.length);
    }
  }
  return source;
}
```

### TransformModule API Types
```typescript
// Source: Qwik optimizer types.ts [VERIFIED: WebFetch from GitHub]
export interface TransformModulesOptions {
  input: TransformModuleInput[];
  srcDir: string;
  rootDir?: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  sourceMaps?: boolean;
  transpileTs?: boolean;
  transpileJsx?: boolean;
  preserveFilenames?: boolean;
  explicitExtensions?: boolean;
  mode?: EmitMode;
  scope?: string;
  stripExports?: string[];
  regCtxName?: string[];
  stripCtxName?: string[];
  stripEventHandlers?: boolean;
  isServer?: boolean;
}

export interface TransformModuleInput {
  path: string;
  code: string;
  devPath?: string;
}

export interface TransformOutput {
  modules: TransformModule[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

export interface TransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: SegmentAnalysis | null;
  origPath: string | null;
}

export interface SegmentAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  extension: string;
  parent: string | null;
  ctxKind: 'eventHandler' | 'function';
  ctxName: string;
  captures: boolean;
  loc: [number, number];
}

export type EntryStrategy =
  | { type: 'inline' }
  | { type: 'hoist' }
  | { type: 'hook'; manual?: Record<string, string> }
  | { type: 'segment'; manual?: Record<string, string> }
  | { type: 'single'; manual?: Record<string, string> }
  | { type: 'component'; manual?: Record<string, string> }
  | { type: 'smart'; manual?: Record<string, string> };

export type MinifyMode = 'simplify' | 'none';
export type EmitMode = 'dev' | 'prod' | 'lib';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@builder.io/qwik` imports | `@qwik.dev/core` imports | Qwik v2 (2024) | Must rewrite both old and new import paths |
| `useLexicalScope()` for captures | `_captures` array pattern | Qwik v2 (2024) | Phase 3 concern, but segment format uses new pattern |
| Hook → Segment terminology | "Segment" is the official term | Qwik v2 | API types use `SegmentAnalysis`, not `HookAnalysis` |
| SWC/Rust optimizer | TypeScript optimizer (this project) | In progress | Drop-in replacement maintaining same output |

**Deprecated/outdated:**
- `HookAnalysis` type: renamed to `SegmentAnalysis` in current Qwik
- `@builder.io/*` import paths: still supported via rewriting but `@qwik.dev/*` is canonical

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | oxc-parser AST positions match the original source character offsets exactly (needed for magic-string) | Architecture Patterns | HIGH -- if positions are off, all magic-string operations fail. Must verify immediately with first test. |
| A2 | TS stripping should happen AFTER extraction, not before, to preserve position accuracy | Pitfall 2 | MEDIUM -- if oxc-transform preserves position mappings, stripping first could work too. Test early. |
| A3 | oxc-walker ScopeTracker correctly identifies all variable declarations in scope for capture detection | Architecture Patterns | MEDIUM -- Phase 2 only needs basic detection, Phase 3 does full capture analysis. |
| A4 | The `//` separator comments in output are single-line `//` comments (not `/* */` or empty lines) | Pattern 2 | LOW -- clearly visible in all snapshots, but need to confirm AST comparison handles these. |
| A5 | Segment extension is determined by JSX presence in the segment body, not the source file extension | Pattern 8 | MEDIUM -- some edge cases might differ. Verify against full corpus. |
| A6 | Phase 2 can emit `captures: false` for all segments and defer capture analysis to Phase 3 | Summary | LOW -- Phase 3 will handle captures, but some snapshot tests might fail if captures metadata is wrong. |

## Open Questions (RESOLVED)

1. **How does oxc-parser represent the AST positions for magic-string?**
   - What we know: oxc-parser outputs ESTree with `start` and `end` properties on nodes
   - What's unclear: Whether these are byte offsets or character offsets (matters for UTF-8 multi-byte chars)
   - RESOLVED: oxc-parser uses byte offsets. In practice all Qwik source is ASCII, so byte = character offset. Test immediately with first extraction task.

2. **Should segment code generation use magic-string or string concatenation?**
   - What we know: Parent module rewriting must use magic-string (edit-in-place). Segments are generated from scratch.
   - RESOLVED: String concatenation for segment modules. They are built from extracted code + generated imports, not edited from original source. Plan 03 implements this.

3. **How to handle the `entry` field in segment metadata?**
   - What we know: Most segments have `entry: null`. Some (exported component segments) have `entry: "test.tsx_entry_Parent"` pattern.
   - RESOLVED: entry=null for all segments in Phase 2. Entry strategy logic deferred to Phase 5 (ENT-01..04).

4. **What determines segment ordering in parent module output?**
   - What we know: QRL declarations appear sorted alphabetically in the parent module
   - RESOLVED: Sort QRL declarations alphabetically by symbol name, matching snapshot evidence. Plan 04 implements this.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24+ | -- |
| oxc-parser | AST parsing | Yes (installed) | 0.124.0 | -- |
| oxc-walker | AST traversal | Not installed | 0.7.0 (npm) | -- |
| oxc-transform | TS stripping | Not installed | 0.124.0 (npm) | -- |
| magic-string | Source rewriting | Not installed | 0.30.21 (npm) | -- |
| siphash | Hashing | Yes (installed) | 1.1.0+ | -- |
| pathe | Path utils | Yes (installed) | 2.0.3 | -- |
| vitest | Testing | Yes (installed) | 4.1.4 | -- |

**Missing dependencies with no fallback:**
- oxc-walker, oxc-transform, magic-string -- all installable via npm

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (exists from Phase 1) |
| Quick run command | `npx vitest run tests/optimizer/ --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXTRACT-01 | Detect marker function calls ending with `$` | unit | `npx vitest run tests/optimizer/extract.test.ts` | No -- Wave 0 |
| EXTRACT-02 | Extract closure argument as segment | unit | Same as above | No -- Wave 0 |
| EXTRACT-03 | Handle nested `$()` calls with parent-child | integration | `npx vitest run tests/optimizer/transform.test.ts` | No -- Wave 0 |
| EXTRACT-04 | Generate segment module with deterministic name | unit | `npx vitest run tests/optimizer/segment-codegen.test.ts` | No -- Wave 0 |
| EXTRACT-05 | Rewrite parent module with QRL references | unit | `npx vitest run tests/optimizer/rewrite-parent.test.ts` | No -- Wave 0 |
| EXTRACT-06 | Handle custom inlined functions | integration | `npx vitest run tests/optimizer/transform.test.ts` | No -- Wave 0 |
| EXTRACT-07 | Emit complete segment metadata | unit | `npx vitest run tests/optimizer/extract.test.ts` | No -- Wave 0 |
| CALL-01..03 | Rewrite call forms ($->Qrl) | unit | `npx vitest run tests/optimizer/rewrite-calls.test.ts` | No -- Wave 0 |
| CALL-04 | Handle sync$ to _qrlSync | unit | Same as above | No -- Wave 0 |
| CALL-05 | Add PURE annotations | unit | Same as above | No -- Wave 0 |
| IMP-01..03 | Rewrite import paths | unit | `npx vitest run tests/optimizer/rewrite-imports.test.ts` | No -- Wave 0 |
| IMP-04..06 | Add/deduplicate imports | unit | Same as above | No -- Wave 0 |
| API-01..03 | transformModule() API | integration | `npx vitest run tests/optimizer/transform.test.ts` | No -- Wave 0 |
| SNAPSHOT BATCH | Full snapshot corpus validation | integration | `npx vitest run tests/optimizer/snapshot-batch.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + batch snapshot tests passing

### Wave 0 Gaps
- [ ] `tests/optimizer/extract.test.ts` -- covers EXTRACT-01, 02, 07
- [ ] `tests/optimizer/segment-codegen.test.ts` -- covers EXTRACT-04
- [ ] `tests/optimizer/rewrite-parent.test.ts` -- covers EXTRACT-05
- [ ] `tests/optimizer/rewrite-calls.test.ts` -- covers CALL-01..05
- [ ] `tests/optimizer/rewrite-imports.test.ts` -- covers IMP-01..06
- [ ] `tests/optimizer/context-stack.test.ts` -- covers naming/context stack
- [ ] `tests/optimizer/transform.test.ts` -- integration tests using snapshots (EXTRACT-03, 06, API-01..03)
- [ ] `tests/optimizer/snapshot-batch.test.ts` -- batch snapshot validation
- [ ] Install: `npm install magic-string && npm install -D oxc-walker oxc-transform`

## Security Domain

Security enforcement is not applicable to this phase. Phase 2 is a compiler/transformer operating on trusted source code inputs. No user-facing input validation, no network I/O, no authentication, no data storage.

| ASVS Category | Applies | Reason |
|---------------|---------|--------|
| V2 Authentication | No | No auth in compiler |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access control |
| V5 Input Validation | No | Input is trusted source files from developer's filesystem |
| V6 Cryptography | No | SipHash is for naming, not security |

## Sources

### Primary (HIGH confidence)
- 209 snapshot files in `match-these-snaps/` -- all transformation patterns reverse-engineered from corpus [VERIFIED: filesystem]
- [Qwik transform.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) -- algorithm details [VERIFIED: WebFetch]
- [Qwik types.ts](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/src/types.ts) -- API interfaces [VERIFIED: WebFetch]
- [oxc-walker GitHub](https://github.com/oxc-project/oxc-walker) -- walk(), ScopeTracker API [VERIFIED: WebFetch]
- Phase 1 source: `src/hashing/siphash.ts`, `src/hashing/naming.ts`, `src/testing/snapshot-parser.ts` [VERIFIED: filesystem]

### Secondary (MEDIUM confidence)
- [Qwik plugin.ts](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/src/plugins/plugin.ts) -- how Vite plugin calls optimizer [VERIFIED: WebFetch]
- [magic-string npm](https://www.npmjs.com/package/magic-string) -- API for MagicString class [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- oxc-parser position accuracy for magic-string integration -- needs empirical verification [ASSUMED]
- Extension determination logic -- inferred from snapshot patterns, not from Rust source [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified on npm, existing Phase 1 stack confirmed
- Architecture: HIGH -- extraction algorithm reverse-engineered from 209 snapshots + Rust source
- Pitfalls: HIGH -- identified from direct analysis of transformation patterns and tool API characteristics
- API types: HIGH -- extracted directly from Qwik types.ts source

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain -- Qwik optimizer behavior well-established)
