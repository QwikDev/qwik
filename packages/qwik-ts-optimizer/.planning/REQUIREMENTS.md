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

- [ ] **EXTRACT-01**: Detect marker function calls (any call where callee name ends with `$`)
- [ ] **EXTRACT-02**: Extract closure argument from marker call as a segment
- [ ] **EXTRACT-03**: Handle nested `$()` calls (segments within segments, parent-child relationships)
- [ ] **EXTRACT-04**: Generate segment module with exported const using deterministic name
- [ ] **EXTRACT-05**: Rewrite parent module replacing `$()` calls with `qrl(() => import(...))` references
- [ ] **EXTRACT-06**: Handle custom inlined functions (user-defined `$`-suffixed functions)
- [ ] **EXTRACT-07**: Emit segment metadata (origin, name, hash, displayName, parent, ctxKind, ctxName, captures, loc, paramNames, captureNames)

### Capture Analysis

- [ ] **CAPT-01**: Detect variables referenced inside `$()` closure but declared outside (scoped identifiers)
- [ ] **CAPT-02**: Inject `_captures` array access in segment modules for captured variables
- [ ] **CAPT-03**: Generate `.w([captured1, captured2])` wrapping on QRL references in parent module
- [ ] **CAPT-04**: Handle `var` hoisting across `$()` boundaries correctly
- [ ] **CAPT-05**: Handle destructured parameters and bindings in capture analysis
- [ ] **CAPT-06**: Distinguish between captures (outer scope) and paramNames (positional args from `q:p`/`q:ps`)

### Call Form Rewriting

- [ ] **CALL-01**: Rewrite `component$` to `componentQrl`
- [ ] **CALL-02**: Rewrite `useTask$`, `useVisibleTask$`, `useComputed$` and other `use*$` hooks to `*Qrl` forms
- [ ] **CALL-03**: Rewrite `server$` to `serverQrl`
- [ ] **CALL-04**: Handle `sync$` to `_qrlSync` with serialized function body string
- [ ] **CALL-05**: Add `/*#__PURE__*/` annotations on QRL declarations and `componentQrl` calls

### Import Handling

- [ ] **IMP-01**: Rewrite `@builder.io/qwik` to `@qwik.dev/core`
- [ ] **IMP-02**: Rewrite `@builder.io/qwik-city` to `@qwik.dev/router`
- [ ] **IMP-03**: Rewrite `@builder.io/qwik-react` to `@qwik.dev/react`
- [ ] **IMP-04**: Add necessary imports to parent module (`qrl`, `componentQrl`, etc.)
- [ ] **IMP-05**: Add necessary imports to segment modules (only what each segment references)
- [ ] **IMP-06**: Deduplicate imports — don't re-import already-imported symbols

### JSX Transform

- [ ] **JSX-01**: Transform JSX elements to `_jsxSorted(tag, varProps, constProps, children, flags, key)` calls
- [ ] **JSX-02**: Classify props into varProps (mutable — signals, stores, computed) and constProps (immutable — literals)
- [ ] **JSX-03**: Compute flags bitmask encoding children type and mutability
- [ ] **JSX-04**: Generate deterministic keys (`u6_N` pattern) for JSX elements
- [ ] **JSX-05**: Handle `_jsxSplit` for elements with spread props, using `_getVarProps`/`_getConstProps`
- [ ] **JSX-06**: Handle fragment transform

### Signal Optimizations

- [ ] **SIG-01**: Detect `signal.value` access in JSX props and wrap with `_wrapProp(signal)`
- [ ] **SIG-02**: Detect `store.field` access in JSX props and wrap with `_wrapProp(store, "field")`
- [ ] **SIG-03**: Detect computed expressions in JSX props and generate `_fnSignal(_hf0, [deps], _hf0_str)`
- [ ] **SIG-04**: Hoist signal functions to module scope as `_hf0`, `_hf1` with corresponding `_hf0_str` strings
- [ ] **SIG-05**: Correctly identify when NOT to wrap (function calls, binary with unknown operands, etc.)

### Event Handler Transform

- [ ] **EVT-01**: Transform `onClick$` to `q-e:click` in constProps
- [ ] **EVT-02**: Transform `document:onFocus$` to `q-d:focus`
- [ ] **EVT-03**: Transform `window:onClick$` to `q-w:click`
- [ ] **EVT-04**: Handle custom event names and kebab-case conversion
- [ ] **EVT-05**: Handle passive events and `preventdefault` directives
- [ ] **EVT-06**: Extract event handler closures as segments

### Loop-Context Hoisting

- [ ] **LOOP-01**: Hoist `.w([captures])` above loops for event handlers inside loops
- [ ] **LOOP-02**: Inject `q:p` prop for iteration variable access by handlers
- [ ] **LOOP-03**: Inject `q:ps` for multiple handler captures on same element (sorted alphabetically)
- [ ] **LOOP-04**: Generate positional parameter padding (`_`, `_1`, `_2`) for unused positions
- [ ] **LOOP-05**: Handle all loop types (map, for-i, for-of, for-in, while/do-while)

### Variable Migration

- [ ] **MIG-01**: Move variable declarations used only by one segment into that segment's module
- [ ] **MIG-02**: Export shared variables from parent as `_auto_VARNAME`
- [ ] **MIG-03**: Keep exported variables at root level (never migrate)
- [ ] **MIG-04**: Don't migrate declarations with side effects
- [ ] **MIG-05**: Handle complex destructuring patterns during migration

### Entry Strategies

- [ ] **ENT-01**: Smart mode (default) — each segment as separate file with dynamic import
- [ ] **ENT-02**: Inline/Hoist mode — segments inlined using `_noopQrl` + `.s()` pattern
- [ ] **ENT-03**: Component entry strategy — group segments by component
- [ ] **ENT-04**: Manual chunks strategy — custom grouping via configuration

### Build Modes

- [ ] **MODE-01**: Development mode — `qrlDEV()` with file/line/displayName metadata
- [ ] **MODE-02**: Dev mode JSX source info (fileName, lineNumber, columnNumber)
- [ ] **MODE-03**: HMR injection — `_useHmr(filePath)` in component segments
- [ ] **MODE-04**: Server strip mode — server-only code replaced with null exports
- [ ] **MODE-05**: Client strip mode — client-only code replaced with null
- [ ] **MODE-06**: Strip exports mode — specified exports replaced with throw statements
- [ ] **MODE-07**: `isServer`/`isBrowser`/`isDev` const replacement

### Bind Syntax

- [ ] **BIND-01**: Transform `bind:value` to value prop + `q-e:input` handler with `inlinedQrl`
- [ ] **BIND-02**: Transform `bind:checked` to checked prop + `q-e:input` handler
- [ ] **BIND-03**: Preserve unknown `bind:xxx` attributes as-is

### Diagnostics

- [ ] **DIAG-01**: Emit C02 FunctionReference error for functions/classes crossing `$()` boundary
- [ ] **DIAG-02**: Emit C03 CanNotCapture error for invalid captures
- [ ] **DIAG-03**: Emit C05 MissingQrlImplementation error for missing `$` implementations
- [ ] **DIAG-04**: Support `@qwik-disable-next-line` comment directive for suppression

### Public API

- [ ] **API-01**: Export `transformModule()` function with same interface as current NAPI binding
- [ ] **API-02**: Return transformed parent module code, array of segments (code + metadata), and diagnostics
- [ ] **API-03**: Accept options: filename, entryStrategy, mode (dev/prod), isServer, stripExports, etc.

## v2 Requirements

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
| EXTRACT-01 | Phase 2 | Pending |
| EXTRACT-02 | Phase 2 | Pending |
| EXTRACT-03 | Phase 2 | Pending |
| EXTRACT-04 | Phase 2 | Pending |
| EXTRACT-05 | Phase 2 | Pending |
| EXTRACT-06 | Phase 2 | Pending |
| EXTRACT-07 | Phase 2 | Pending |
| CALL-01 | Phase 2 | Pending |
| CALL-02 | Phase 2 | Pending |
| CALL-03 | Phase 2 | Pending |
| CALL-04 | Phase 2 | Pending |
| CALL-05 | Phase 2 | Pending |
| IMP-01 | Phase 2 | Pending |
| IMP-02 | Phase 2 | Pending |
| IMP-03 | Phase 2 | Pending |
| IMP-04 | Phase 2 | Pending |
| IMP-05 | Phase 2 | Pending |
| IMP-06 | Phase 2 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| CAPT-01 | Phase 3 | Pending |
| CAPT-02 | Phase 3 | Pending |
| CAPT-03 | Phase 3 | Pending |
| CAPT-04 | Phase 3 | Pending |
| CAPT-05 | Phase 3 | Pending |
| CAPT-06 | Phase 3 | Pending |
| MIG-01 | Phase 3 | Pending |
| MIG-02 | Phase 3 | Pending |
| MIG-03 | Phase 3 | Pending |
| MIG-04 | Phase 3 | Pending |
| MIG-05 | Phase 3 | Pending |
| JSX-01 | Phase 4 | Pending |
| JSX-02 | Phase 4 | Pending |
| JSX-03 | Phase 4 | Pending |
| JSX-04 | Phase 4 | Pending |
| JSX-05 | Phase 4 | Pending |
| JSX-06 | Phase 4 | Pending |
| SIG-01 | Phase 4 | Pending |
| SIG-02 | Phase 4 | Pending |
| SIG-03 | Phase 4 | Pending |
| SIG-04 | Phase 4 | Pending |
| SIG-05 | Phase 4 | Pending |
| EVT-01 | Phase 4 | Pending |
| EVT-02 | Phase 4 | Pending |
| EVT-03 | Phase 4 | Pending |
| EVT-04 | Phase 4 | Pending |
| EVT-05 | Phase 4 | Pending |
| EVT-06 | Phase 4 | Pending |
| BIND-01 | Phase 4 | Pending |
| BIND-02 | Phase 4 | Pending |
| BIND-03 | Phase 4 | Pending |
| LOOP-01 | Phase 4 | Pending |
| LOOP-02 | Phase 4 | Pending |
| LOOP-03 | Phase 4 | Pending |
| LOOP-04 | Phase 4 | Pending |
| LOOP-05 | Phase 4 | Pending |
| ENT-01 | Phase 5 | Pending |
| ENT-02 | Phase 5 | Pending |
| ENT-03 | Phase 5 | Pending |
| ENT-04 | Phase 5 | Pending |
| MODE-01 | Phase 5 | Pending |
| MODE-02 | Phase 5 | Pending |
| MODE-03 | Phase 5 | Pending |
| MODE-04 | Phase 5 | Pending |
| MODE-05 | Phase 5 | Pending |
| MODE-06 | Phase 5 | Pending |
| MODE-07 | Phase 5 | Pending |
| DIAG-01 | Phase 6 | Pending |
| DIAG-02 | Phase 6 | Pending |
| DIAG-03 | Phase 6 | Pending |
| DIAG-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 81 total
- Mapped to phases: 81
- Unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after roadmap creation*
