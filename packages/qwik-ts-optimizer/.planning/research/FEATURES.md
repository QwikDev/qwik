# Feature Landscape

**Domain:** Qwik Optimizer (TypeScript drop-in replacement for Rust/SWC optimizer)
**Researched:** 2026-04-10
**Source:** 209 snapshot test files in `match-these-snaps/`

## Table Stakes

Features that must match SWC output exactly. Missing = Qwik apps break.

### Core Extraction Pipeline

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Marker function detection (`$` suffix) | Entire optimizer is built on detecting `$()`, `component$()`, `useTask$()`, etc. | Med | Must recognize any call ending in `$` -- not just known ones. Custom inlined functions too. |
| Segment extraction | Closures inside `$()` become separate lazy-loadable modules | High | Each segment gets exported const with deterministic name + hash |
| Deterministic symbol naming | Names follow `{context}_{ctxName}_{hash}` pattern (e.g., `App_component_ckEPmXZlub0`) | Med | Hash algorithm must match SWC exactly or QRL resolution breaks |
| Parent module rewriting | Replace `$()` calls with `qrl(() => import(...))` references | High | Must handle `component$` -> `componentQrl`, `useTask$` -> `useTaskQrl`, etc. |
| Segment metadata emission | Each segment needs origin, name, hash, displayName, parent, ctxKind, ctxName, captures, loc, paramNames, captureNames | Med | Metadata drives the Vite plugin's chunk management |

### Capture Analysis

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Scoped identifier detection | Variables referenced inside `$()` but declared outside must be captured | High | Core correctness requirement -- wrong captures = runtime crashes |
| `_captures` array injection | Captured variables accessed via `const x = _captures[0]` in segments | Med | Import `_captures` from `@qwik.dev/core`, destructure in order |
| `.w()` capture wrapping | QRL references use `.w([captured1, captured2])` to pass captures | Med | Seen in `useTaskQrl(q_handler.w([state]))` pattern |
| Non-capturable detection (C02 diagnostic) | Functions and classes declared in parent scope cannot cross `$()` boundaries | Med | Must emit C02 error but still generate output (non-fatal) |

### JSX Transform

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `_jsxSorted` generation | All JSX elements become `_jsxSorted(tag, varProps, constProps, children, flags, key)` | High | 6-argument call with prop classification |
| varProps / constProps classification | Props split into mutable (varProps) and immutable (constProps) | High | Signals, stores, computed expressions go to varProps; literals, imports go to constProps |
| Flags bitmask computation | Numeric flags parameter encoding children type and mutability | Med | Values 0-7 observed; encodes children shape + immutability |
| Key generation (`u6_N` pattern) | Deterministic keys for JSX elements | Low | Sequential counter within component scope |
| `_jsxSplit` for spread props | Elements with `{...props}` use `_jsxSplit` + `_getVarProps`/`_getConstProps` | Med | Only triggered by spread attributes on elements |
| Fragment handling | `<>...</>` becomes `_jsxSorted(_Fragment, ...)` with Fragment imported from jsx-runtime | Low | Import from `@qwik.dev/core/jsx-runtime` |
| Children normalization | Single child vs array children vs text children | Med | Affects both children argument and flags bitmask |

### Signal Optimizations

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `_wrapProp` for signal access | `signal.value` in props becomes `_wrapProp(signal)` | Med | Simple `.value` access pattern detection |
| `_wrapProp` with key for store access | `store.field` becomes `_wrapProp(store, "field")` | Med | Named property access on stores |
| `_fnSignal` for computed expressions | `12 + signal.value` becomes `_fnSignal(_hf0, [signal], _hf0_str)` | High | Must hoist function + string representation to module scope |
| Hoisted signal functions | `_hf0`, `_hf1` etc. with corresponding `_hf0_str` string representations | High | Function body uses `p0`, `p1` params; string is minified expression |
| Signal detection rules | Know when to wrap vs inline -- `signal.value()` (call) is NOT inlined | Med | Calls, binary with unknown, mutable() all skip inlining |

### Event Handler Transform

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `onClick$` -> `q-e:click` rewriting | Event handler props become `q-e:{eventName}` in constProps | Med | Strips `on` prefix, lowercases, converts to kebab-case |
| `document:onFocus$` -> `q-d:focus` | Document-scoped events use `q-d:` prefix | Low | Parse `document:` prefix |
| `window:onClick$` -> `q-w:click` | Window-scoped events use `q-w:` prefix | Low | Parse `window:` prefix |
| Custom event names | `on-anotherCustom$` -> `q-e:another-custom` | Low | Preserve kebab-case custom names |
| Passive events | `passive:click` and `preventdefault:click` handling | Low | `q-ep:click` prefix for passive+prevent |
| Event handler extraction | Handler closures become separate segments | Med | Same extraction pipeline as other `$()` calls |

### Loop-Context Event Hoisting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `.w()` hoisting for loop handlers | Event handlers inside loops get `.w([captures])` hoisted above the loop | High | QRL created once, captures bound once, reused in iterations |
| `q:p` injection for iteration variables | Loop iteration variables passed via `q:p` prop on the element | High | `item`, `i`, `key` etc. become params in handler signature |
| `q:ps` for multiple handler captures | When multiple handlers on same element capture different signals | Med | Array of signals sorted alphabetically, handlers receive as positional params |
| paramNames with padding (`_`, `_1`, `_2`) | Unused positional params padded with underscores | Med | Handler gets `(_, _1, item)` when `item` is at position 2 |

### Variable Migration

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Move declarations to segments | Variables only used by one segment move into that segment's module | High | Avoids unnecessary parent module bloat |
| `_auto_` prefixed re-exports | Shared variables stay in parent, exported as `_auto_VARNAME` | Med | Segments import via `import { _auto_X as X } from "./parent"` |
| Exported variables stay at root | `export const` never migrates -- must remain accessible | Low | Simple check |
| Side-effect aware migration | Don't move declarations with side effects | Med | Function calls in initializers block migration |
| Destructuring-aware migration | Complex destructuring patterns handled correctly | High | Array/object destructuring with rest, defaults, nested patterns |

### Call Form Rewriting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `component$` -> `componentQrl` | Sugar form to QRL form | Low | Simple rename + restructure |
| `useTask$` -> `useTaskQrl` | Same pattern for all `use*$` hooks | Low | Applies to ~15 hook variants |
| `server$` -> `serverQrl` | Server function wrapping | Low | |
| `qwikify$` -> `qwikifyQrl` | React integration | Low | From `@builder.io/qwik-react` -> `@qwik.dev/react` |
| `sync$` -> `_qrlSync` with serialized string | Synchronous QRLs include minified function body as string | High | Must serialize function body, strip comments |
| `_noopQrl` for inlined entry strategy | Inlined segments use `_noopQrl("hash")` + `.s(fn)` pattern | Med | Segment body inlined at call site |
| `_regSymbol` for hoisted server segments | Server functions get registered with hash | Med | Seen in `server$` context names |

### Import Handling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `@builder.io/qwik` -> `@qwik.dev/core` | Legacy import path rewriting | Low | Applies to all `@builder.io/*` imports |
| `@builder.io/qwik-city` -> `@qwik.dev/router` | Router package rename | Low | |
| `@builder.io/qwik-react` -> `@qwik.dev/react` | React integration rename | Low | |
| Import deduplication | Don't re-import already-imported symbols | Low | |
| Segment-specific imports | Each segment only imports what it needs | Med | Analyze references within segment body |
| `#__PURE__` annotations | Tree-shaking hints on QRL declarations | Low | `/*#__PURE__*/` before `qrl()` and `componentQrl()` calls |

### Entry Strategies

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Smart (default) | Each segment becomes separate file, QRL uses dynamic import | Low | Default behavior shown in most snapshots |
| Inline/Hoist | Segments inlined into parent module using `_noopQrl` + `.s()` | High | All code stays in one file, no dynamic imports |
| Component | Group segments by component | Med | `entry` field in metadata set to component name |
| Single | All segments in one chunk | Low | |
| Manual chunks | Custom grouping via configuration | Med | `entry` field set to manual chunk name |

### Build Modes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Development mode | `qrlDEV()` instead of `qrl()` with file/line/displayName info | Med | Extra metadata object as last argument |
| Dev mode JSX source info | `{fileName, lineNumber, columnNumber}` appended to `_jsxSorted` | Med | Additional object argument for React DevTools compatibility |
| HMR injection | `_useHmr(filePath)` call added to component bodies in dev | Low | Only for `component$` segments, not raw `$()` |
| Production mode | Minimal output, no dev metadata | Low | Default |
| Server strip mode | Server-only code (`serverStuff$`, `serverLoader$`) replaced with `null` exports | Med | Segment bodies become `export const s_xxx = null` |
| Client strip mode | Client-only code stripped, replaced with `null` | Med | Mirror of server strip |
| Strip exports mode | Specified exports replaced with `throw` statements | Med | `throw "Symbol removed by Qwik Optimizer..."` |
| `isServer`/`isBrowser`/`isDev` const replacement | Build-time constants replaced with values | Low | Dead code elimination works downstream |
| Lib mode | Different output for library builds | Low | Affects segment naming |

### Diagnostics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| C02: FunctionReference | Functions/classes crossing `$()` boundary | Med | Non-fatal warning |
| C03: CanNotCapture | Invalid capture attempt | Med | |
| C05: MissingQrlImplementation | Using `useMemo$` or custom `$` without QRL implementation | Med | |
| `@qwik-disable-next-line` directive | Comment-based diagnostic suppression | Low | Supports multiple codes: `/* @qwik-disable-next-line C05, preventdefault-passive-check */` |
| Passive event warnings | Warning when passive events have `preventDefault` | Low | |

### Bind Syntax

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `bind:value` -> value prop + `q-e:input` handler | Two-way binding for value inputs | Med | Uses `inlinedQrl(_val, "_val", [signal])` |
| `bind:checked` -> checked prop + `q-e:input` handler | Two-way binding for checkbox inputs | Med | Uses `inlinedQrl(_chk, "_chk", [signal])` |
| Unknown `bind:xxx` preserved as-is | Non-standard bind attributes pass through | Low | `bind:stuff` stays as `bind:stuff` in props |

### Miscellaneous

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| TypeScript type stripping | Remove TS syntax before processing | Low | Handled by oxc-transform |
| File extension awareness | `.tsx`, `.ts`, `.js`, `.jsx` affect output extension | Low | |
| Default export handling | `export default component$` works correctly | Low | Uses filename for segment naming |
| Windows path support | Backslash path normalization | Low | Dedicated test for this |
| Relative path handling | Segment imports use correct relative paths | Low | |
| `tagName` option on `component$` | Passed through to `componentQrl` second argument | Low | `componentQrl(qrl, { tagName: "my-foo" })` |
| Preserve filenames option | Affects segment file naming | Low | |

## Differentiators

Features that improve over the SWC implementation. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pure TypeScript implementation | Team can read, debug, and modify the optimizer without Rust expertise | N/A | Core motivation for the project |
| AI-assisted development | TS code is far more amenable to AI-assisted debugging and feature work than Rust/SWC | N/A | Multiplier on team velocity |
| Faster iteration cycles | No Rust compile step, no NAPI bridge debugging | N/A | Minutes vs hours for changes |
| AST-based test comparison | More robust than string comparison; catches semantic issues, ignores cosmetic ones | Med | Already designed as part of test strategy |
| Better error messages | TS implementation can provide richer diagnostic context (source locations, suggestions) | Med | SWC diagnostics are minimal |
| Easier extensibility | Adding new `$` markers or transforms is TS code, not Rust | Low | Future Qwik features are faster to implement |
| Source map generation (future) | Can be added incrementally; magic-string provides this for free | Med | Out of scope initially but trivially addable |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| SWC-exact whitespace matching | SWC's formatting is an artifact of its printer, not semantically meaningful; chasing it caused the prior Rust rewrite to fail | AST-based semantic comparison only |
| Source map byte-offset matching | Byte positions will differ between implementations; comparing them is meaningless | Skip source map comparison entirely in tests |
| Full AST codegen (reprint entire file) | Reprinting loses comments, formatting, and is fragile. Prior Rust attempt failed partly due to this | Use magic-string for surgical text replacement |
| SWC resolver/hygiene/fixer passes | These are SWC-internal compensations for its architecture; not needed with magic-string approach | Leverage oxc-parser + magic-string directly |
| Dead code elimination | Tree-shaking is handled by Rolldown/esbuild downstream; duplicating it adds complexity for zero benefit | Let bundler handle DCE |
| Vite plugin integration code | The existing Qwik core Vite plugin handles all Vite hooks; the optimizer is just a function it calls | Expose `transformModule()` only |
| Custom bundler output | The optimizer transforms single files; it does not bundle | Each file transformed independently |
| Incremental/watch mode | The Vite plugin handles file watching and re-calling the optimizer | Stateless per-file transform |
| String-based snapshot matching | Proved unworkable in prior Rust attempt -- cosmetic differences cause false failures | AST comparison with metadata exact-match |

## Feature Dependencies

```
TypeScript stripping -> Marker function detection -> Segment extraction
Marker function detection -> Call form rewriting (component$ -> componentQrl)
Segment extraction -> Capture analysis -> _captures injection
Segment extraction -> Variable migration -> _auto_ re-exports
Segment extraction -> Deterministic naming + hashing
Segment extraction -> Segment metadata emission

JSX parsing -> _jsxSorted generation -> varProps/constProps classification
varProps/constProps classification -> Signal detection -> _wrapProp / _fnSignal
_fnSignal -> Hoisted signal functions (_hf0 pattern)

Event handler detection -> q-e:/q-d:/q-w: rewriting
Event handler detection (in loops) -> .w() hoisting + q:p injection

Marker detection + Entry strategy -> _noopQrl (inline) vs qrl() (smart) vs grouped

Build mode flag -> Dev metadata injection (qrlDEV, _useHmr, JSX source info)
Build mode flag -> Server/client strip mode
Build mode flag -> Const replacement (isServer, isBrowser, isDev)
```

## MVP Recommendation

Prioritize (Phase 1 -- get apps running):
1. Marker function detection + segment extraction (core pipeline)
2. Capture analysis + `_captures` injection
3. Deterministic symbol naming + hashing
4. Parent module rewriting (call form `$` -> `Qrl`)
5. Basic JSX transform (`_jsxSorted`, no signal optimization yet)
6. Import handling (path rewriting, dedup)

Prioritize (Phase 2 -- pass majority of snapshots):
7. Signal optimizations (`_wrapProp`, `_fnSignal`, hoisted functions)
8. Event handler transform (q-e/q-d/q-w rewriting)
9. Variable migration + `_auto_` exports
10. Loop-context hoisting (`.w()` + `q:p`/`q:ps`)

Prioritize (Phase 3 -- full parity):
11. Entry strategies (inline/hoist, component, manual chunks)
12. Build modes (dev, server strip, client strip, strip exports)
13. Bind syntax
14. sync$ serialization
15. Diagnostics (C02, C03, C05, qwik-disable)

Defer:
- Source map generation: Not needed for functional parity, magic-string provides it when wanted
- Performance optimization: Get correctness first, optimize hot paths later

## Sources

- 209 snapshot test files in `match-these-snaps/` (PRIMARY -- these ARE the spec)
- `.planning/PROJECT.md` (project context and constraints)
- Snapshot format analysis: INPUT section, segment outputs with metadata JSON, parent module output, diagnostics array
