# Requirements: Qwik Optimizer (TypeScript)

**Defined:** 2026-04-10
**Core Value:** The optimizer must produce output that is runtime-identical to the SWC optimizer — same segments extracted, same captures computed, same hashes generated — so existing Qwik apps work without changes.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Test Infrastructure

- [x] **TEST-01**: Snapshot parser reads `.snap` files and extracts INPUT, segment outputs, metadata JSON, and diagnostics
- [x] **TEST-02**: AST comparison utility parses both expected and actual code with oxc-parser and compares structurally (ignoring whitespace/formatting)
- [x] **TEST-03**: Segment metadata comparison matches name, hash, displayName, captures, paramNames, captureNames, ctxKind, ctxName, parent, extension exactly
- [x] **TEST-04**: Test runner supports batch mode — run N snapshots at a time, lock passing batches in CI

### Hash and Naming

- [x] **HASH-01**: SipHash-1-3 implementation with keys (0,0) produces byte-identical hashes to SWC optimizer
- [x] **HASH-02**: Hash input is raw concatenated bytes: scope + rel_path + display_name (no separators)
- [x] **HASH-03**: Hash output is u64 little-endian, base64url-encoded (no padding), with `-` and `_` replaced by `0`
- [x] **HASH-04**: Display name construction follows `{file}_{context}` pattern, verified against all snapshot metadata
- [x] **HASH-05**: Symbol name follows `{context}_{ctxName}_{hash}` pattern

### Core Extraction

- [x] **EXTRACT-01**: Detect marker function calls (any call where callee name ends with `$`)
- [x] **EXTRACT-02**: Extract closure argument from marker call as a segment
- [x] **EXTRACT-03**: Handle nested `$()` calls (segments within segments, parent-child relationships)
- [x] **EXTRACT-04**: Generate segment module with exported const using deterministic name
- [x] **EXTRACT-05**: Rewrite parent module replacing `$()` calls with `qrl(() => import(...))` references
- [x] **EXTRACT-06**: Handle custom inlined functions (user-defined `$`-suffixed functions)
- [x] **EXTRACT-07**: Emit segment metadata (origin, name, hash, displayName, parent, ctxKind, ctxName, captures, loc, paramNames, captureNames)

### Capture Analysis

- [x] **CAPT-01**: Detect variables referenced inside `$()` closure but declared outside (scoped identifiers)
- [x] **CAPT-02**: Inject `_captures` array access in segment modules for captured variables
- [x] **CAPT-03**: Generate `.w([captured1, captured2])` wrapping on QRL references in parent module
- [x] **CAPT-04**: Handle `var` hoisting across `$()` boundaries correctly
- [x] **CAPT-05**: Handle destructured parameters and bindings in capture analysis
- [x] **CAPT-06**: Distinguish between captures (outer scope) and paramNames (positional args from `q:p`/`q:ps`)

### Call Form Rewriting

- [x] **CALL-01**: Rewrite `component$` to `componentQrl`
- [x] **CALL-02**: Rewrite `useTask$`, `useVisibleTask$`, `useComputed$` and other `use*$` hooks to `*Qrl` forms
- [x] **CALL-03**: Rewrite `server$` to `serverQrl`
- [x] **CALL-04**: Handle `sync$` to `_qrlSync` with serialized function body string
- [x] **CALL-05**: Add `/*#__PURE__*/` annotations on QRL declarations and `componentQrl` calls

### Import Handling

- [x] **IMP-01**: Rewrite `@builder.io/qwik` to `@qwik.dev/core`
- [x] **IMP-02**: Rewrite `@builder.io/qwik-city` to `@qwik.dev/router`
- [x] **IMP-03**: Rewrite `@builder.io/qwik-react` to `@qwik.dev/react`
- [x] **IMP-04**: Add necessary imports to parent module (`qrl`, `componentQrl`, etc.)
- [x] **IMP-05**: Add necessary imports to segment modules (only what each segment references)
- [x] **IMP-06**: Deduplicate imports — don't re-import already-imported symbols

### JSX Transform

- [x] **JSX-01**: Transform JSX elements to `_jsxSorted(tag, varProps, constProps, children, flags, key)` calls
- [x] **JSX-02**: Classify props into varProps (mutable — signals, stores, computed) and constProps (immutable — literals)
- [x] **JSX-03**: Compute flags bitmask encoding children type and mutability
- [x] **JSX-04**: Generate deterministic keys (`u6_N` pattern) for JSX elements
- [x] **JSX-05**: Handle `_jsxSplit` for elements with spread props, using `_getVarProps`/`_getConstProps`
- [x] **JSX-06**: Handle fragment transform

### Signal Optimizations

- [x] **SIG-01**: Detect `signal.value` access in JSX props and wrap with `_wrapProp(signal)`
- [x] **SIG-02**: Detect `store.field` access in JSX props and wrap with `_wrapProp(store, "field")`
- [x] **SIG-03**: Detect computed expressions in JSX props and generate `_fnSignal(_hf0, [deps], _hf0_str)`
- [x] **SIG-04**: Hoist signal functions to module scope as `_hf0`, `_hf1` with corresponding `_hf0_str` strings
- [x] **SIG-05**: Correctly identify when NOT to wrap (function calls, binary with unknown operands, etc.)

### Event Handler Transform

- [x] **EVT-01**: Transform `onClick$` to `q-e:click` in constProps
- [x] **EVT-02**: Transform `document:onFocus$` to `q-d:focus`
- [x] **EVT-03**: Transform `window:onClick$` to `q-w:click`
- [x] **EVT-04**: Handle custom event names and kebab-case conversion
- [x] **EVT-05**: Handle passive events and `preventdefault` directives
- [x] **EVT-06**: Extract event handler closures as segments

### Loop-Context Hoisting

- [x] **LOOP-01**: Hoist `.w([captures])` above loops for event handlers inside loops
- [x] **LOOP-02**: Inject `q:p` prop for iteration variable access by handlers
- [x] **LOOP-03**: Inject `q:ps` for multiple handler captures on same element (sorted alphabetically)
- [x] **LOOP-04**: Generate positional parameter padding (`_`, `_1`, `_2`) for unused positions
- [x] **LOOP-05**: Handle all loop types (map, for-i, for-of, for-in, while/do-while)

### Variable Migration

- [x] **MIG-01**: Move variable declarations used only by one segment into that segment's module
- [x] **MIG-02**: Export shared variables from parent as `_auto_VARNAME`
- [x] **MIG-03**: Keep exported variables at root level (never migrate)
- [x] **MIG-04**: Don't migrate declarations with side effects
- [x] **MIG-05**: Handle complex destructuring patterns during migration

### Entry Strategies

- [x] **ENT-01**: Smart mode (default) — each segment as separate file with dynamic import
- [x] **ENT-02**: Inline/Hoist mode — segments inlined using `_noopQrl` + `.s()` pattern
- [x] **ENT-03**: Component entry strategy — group segments by component
- [x] **ENT-04**: Manual chunks strategy — custom grouping via configuration

### Build Modes

- [x] **MODE-01**: Development mode — `qrlDEV()` with file/line/displayName metadata
- [x] **MODE-02**: Dev mode JSX source info (fileName, lineNumber, columnNumber)
- [x] **MODE-03**: HMR injection — `_useHmr(filePath)` in component segments
- [x] **MODE-04**: Server strip mode — server-only code replaced with null exports
- [x] **MODE-05**: Client strip mode — client-only code replaced with null
- [x] **MODE-06**: Strip exports mode — specified exports replaced with throw statements
- [x] **MODE-07**: `isServer`/`isBrowser`/`isDev` const replacement

### Bind Syntax

- [x] **BIND-01**: Transform `bind:value` to value prop + `q-e:input` handler with `inlinedQrl`
- [x] **BIND-02**: Transform `bind:checked` to checked prop + `q-e:input` handler
- [x] **BIND-03**: Preserve unknown `bind:xxx` attributes as-is

### Diagnostics

- [x] **DIAG-01**: Emit C02 FunctionReference error for functions/classes crossing `$()` boundary
- [x] **DIAG-02**: Emit C03 CanNotCapture error for invalid captures
- [x] **DIAG-03**: Emit C05 MissingQrlImplementation error for missing `$` implementations
- [x] **DIAG-04**: Support `@qwik-disable-next-line` comment directive for suppression

### Public API

- [x] **API-01**: Export `transformModule()` function with same interface as current NAPI binding
- [x] **API-02**: Return transformed parent module code, array of segments (code + metadata), and diagnostics
- [x] **API-03**: Accept options: filename, entryStrategy, mode (dev/prod), isServer, stripExports, etc.

## v3.0 Requirements — Reference-Guided Convergence

Target: 70%+ snapshot convergence (147+/210) by fixing the 7 failure families identified in v2.0. SWC reference files in `swc-reference-only/` available as behavioral reference (not reimplementation target).

### Inline/Hoist Strategy

- [x] **IHS-01**: Inline strategy `.s()` body text produces AST-matching output for all inline-strategy snapshots
- [x] **IHS-02**: Hoist strategy generates correct const-fn pattern producing AST-matching output for all hoist-strategy snapshots
- [x] **IHS-03**: Entry strategy selection produces the correct segment structure per snapshot expected output

### Capture Classification

- [x] **CAP-01**: Loop-local variables delivered via function parameters with correct `paramNames` padding, verified by snapshot AST comparison
- [ ] **CAP-02**: Cross-scope captures delivered via `._captures` + `.w()` hoisting, verified by snapshot AST comparison
- [x] **CAP-03**: Segment metadata (`captures`, `captureNames`, `paramNames`) matches snapshot expected metadata

### JSX Transform Refinement

- [x] **JSXR-01**: Flags bitmask values in `_jsxSorted`/`_jsxC` calls match snapshot expected values
- [x] **JSXR-02**: Prop classification (var vs const buckets) produces AST-matching `_jsxSorted` calls
- [x] **JSXR-03**: `_jsxSplit` generation for spread props matches snapshot expected output
- [x] **JSXR-04**: Signal wrapping (`_wrapProp`/`_fnSignal`) placement produces AST-matching segment and parent output

### Variable Migration Refinement

- [x] **MIGR-01**: Variable move vs reexport decisions produce correct parent and segment AST output
- [x] **MIGR-02**: `_auto_` re-exports generated only where snapshot expected output includes them
- [x] **MIGR-03**: Destructured binding migration produces AST-matching segment imports and body

### Sync Functions

- [x] **SYNC-01**: `_qrlSync()` calls produce AST-matching output for all sync-related snapshots

### Convergence Gate

- [ ] **CONV-01**: 147+/210 convergence tests pass (70%+ pass rate)
- [ ] **CONV-02**: All 73 previously-passing tests still pass (zero regressions)
- [ ] **CONV-03**: Zero unit test regressions

## Future Requirements

### Performance

- **PERF-01**: Source map generation via magic-string's built-in support
- **PERF-02**: Incremental parsing for watch mode (only re-parse changed files)
- **PERF-03**: Performance benchmarks comparing against SWC optimizer

### Enhanced Diagnostics

- **EDIAG-01**: Richer error messages with suggestions for fixes
- **EDIAG-02**: Warning for potential performance issues (large captures, deep nesting)

## Out of Scope

| Feature | Reason |
|---------|--------|
| SWC-exact whitespace matching | SWC's formatting is an artifact of its printer; chasing it caused the prior Rust rewrite to fail |
| Source map byte-offset matching | Byte positions differ between implementations; not relevant to runtime correctness |
| Full AST codegen (reprint entire file) | magic-string surgical edits are more reliable than AST reprinting |
| SWC resolver/hygiene/fixer passes | SWC-internal compensations not needed with magic-string approach |
| Dead code elimination | Rolldown/esbuild handles DCE downstream |
| Vite plugin integration code | Existing Qwik core Vite plugin handles all Vite hooks |
| Bundling/chunking | Optimizer transforms single files; bundler handles chunking |
| Watch mode / file system awareness | Vite plugin handles file watching |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 1 | Complete |
| TEST-04 | Phase 1 | Complete |
| HASH-01 | Phase 1 | Complete |
| HASH-02 | Phase 1 | Complete |
| HASH-03 | Phase 1 | Complete |
| HASH-04 | Phase 1 | Complete |
| HASH-05 | Phase 1 | Complete |
| EXTRACT-01 | Phase 2 | Complete |
| EXTRACT-02 | Phase 2 | Complete |
| EXTRACT-03 | Phase 2 | Complete |
| EXTRACT-04 | Phase 2 | Complete |
| EXTRACT-05 | Phase 2 | Complete |
| EXTRACT-06 | Phase 2 | Complete |
| EXTRACT-07 | Phase 2 | Complete |
| CALL-01 | Phase 2 | Complete |
| CALL-02 | Phase 2 | Complete |
| CALL-03 | Phase 2 | Complete |
| CALL-04 | Phase 2 | Complete |
| CALL-05 | Phase 2 | Complete |
| IMP-01 | Phase 2 | Complete |
| IMP-02 | Phase 2 | Complete |
| IMP-03 | Phase 2 | Complete |
| IMP-04 | Phase 2 | Complete |
| IMP-05 | Phase 2 | Complete |
| IMP-06 | Phase 2 | Complete |
| API-01 | Phase 2 | Complete |
| API-02 | Phase 2 | Complete |
| API-03 | Phase 2 | Complete |
| CAPT-01 | Phase 3 | Complete |
| CAPT-02 | Phase 3 | Complete |
| CAPT-03 | Phase 3 | Complete |
| CAPT-04 | Phase 3 | Complete |
| CAPT-05 | Phase 3 | Complete |
| CAPT-06 | Phase 3 | Complete |
| MIG-01 | Phase 3 | Complete |
| MIG-02 | Phase 3 | Complete |
| MIG-03 | Phase 3 | Complete |
| MIG-04 | Phase 3 | Complete |
| MIG-05 | Phase 3 | Complete |
| JSX-01 | Phase 4 | Complete |
| JSX-02 | Phase 4 | Complete |
| JSX-03 | Phase 4 | Complete |
| JSX-04 | Phase 4 | Complete |
| JSX-05 | Phase 4 | Complete |
| JSX-06 | Phase 4 | Complete |
| SIG-01 | Phase 4 | Complete |
| SIG-02 | Phase 4 | Complete |
| SIG-03 | Phase 4 | Complete |
| SIG-04 | Phase 4 | Complete |
| SIG-05 | Phase 4 | Complete |
| EVT-01 | Phase 4 | Complete |
| EVT-02 | Phase 4 | Complete |
| EVT-03 | Phase 4 | Complete |
| EVT-04 | Phase 4 | Complete |
| EVT-05 | Phase 4 | Complete |
| EVT-06 | Phase 4 | Complete |
| BIND-01 | Phase 4 | Complete |
| BIND-02 | Phase 4 | Complete |
| BIND-03 | Phase 4 | Complete |
| LOOP-01 | Phase 4 | Complete |
| LOOP-02 | Phase 4 | Complete |
| LOOP-03 | Phase 4 | Complete |
| LOOP-04 | Phase 4 | Complete |
| LOOP-05 | Phase 4 | Complete |
| ENT-01 | Phase 5 | Complete |
| ENT-02 | Phase 5 | Complete |
| ENT-03 | Phase 5 | Complete |
| ENT-04 | Phase 5 | Complete |
| MODE-01 | Phase 5 | Complete |
| MODE-02 | Phase 5 | Complete |
| MODE-03 | Phase 5 | Complete |
| MODE-04 | Phase 5 | Complete |
| MODE-05 | Phase 5 | Complete |
| MODE-06 | Phase 5 | Complete |
| MODE-07 | Phase 5 | Complete |
| DIAG-01 | Phase 6 | Complete |
| DIAG-02 | Phase 6 | Complete |
| DIAG-03 | Phase 6 | Complete |
| DIAG-04 | Phase 6 | Complete |
| IHS-01 | Phase 17 | Complete |
| IHS-02 | Phase 17 | Complete |
| IHS-03 | Phase 17 | Complete |
| CAP-01 | Phase 18 | Complete |
| CAP-02 | Phase 18 | Pending |
| CAP-03 | Phase 18 | Complete |
| JSXR-01 | Phase 19 | Complete |
| JSXR-02 | Phase 19 | Complete |
| JSXR-03 | Phase 19 | Complete |
| JSXR-04 | Phase 19 | Complete |
| MIGR-01 | Phase 20 | Complete |
| MIGR-02 | Phase 20 | Complete |
| MIGR-03 | Phase 20 | Complete |
| SYNC-01 | Phase 20 | Complete |
| CONV-01 | Phase 21 | Pending |
| CONV-02 | Phase 21 | Pending |
| CONV-03 | Phase 21 | Pending |

**Coverage:**
- v1 requirements: 81 total, mapped: 81, unmapped: 0
- v3.0 requirements: 16 total, mapped: 16, unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after v3.0 roadmap creation*
