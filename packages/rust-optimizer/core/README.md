# Qwik Optimizer

The Qwik optimizer is an SWC-based AST transform that processes TypeScript/JavaScript/JSX source files. Its job is to enable **resumability** — the ability for Qwik applications to serialize their state during SSR and resume on the client without re-executing component code.

It does this by extracting closures marked with `$` into separate lazy-loadable modules ("segments"), transforming JSX into Qwik's internal representation, capturing lexical scope for serialization, and applying platform-specific dead code elimination.

## Core Concepts

### The `$` Marker

Any function call whose name ends with `$` (e.g., `component$`, `useTask$`, `onClick$`, `$()`) marks a **QRL boundary**. The closure argument is extracted into a separate module (a "segment") that can be lazy-loaded. The call is rewritten to use a **QRL** (Qwik Resource Locator) — a reference containing the import path, symbol name, and captured variables.

```ts
// Input
useTask$(() => {
  console.log(state.count);
});

// Output (root module)
useTaskQrl(qrl(() => import('./myFile_useTask_abc123'), 's_abc123', [state]));

// Output (segment module: myFile_useTask_abc123.js)
import { _captures } from '@qwik.dev/core';
export const s_abc123 = () => {
  const state = _captures[0];
  console.log(state.count);
};
```

### Segments

A segment is an extracted closure with metadata. Each segment becomes a separate ES module file (in non-inline strategies). The segment module contains:

1. Imports for all externally-referenced identifiers
2. A `_captures` import if the closure captures lexical variables
3. The closure body as a named export

### Captures (Scoped Identifiers)

When a `$`-closure references variables from its enclosing lexical scope (not imports, not module-level declarations), those variables are **captured**. The optimizer:

1. Identifies captured variables by walking the closure body and checking each identifier against the lexical scope stack
2. Passes them as an array argument to `qrl()`: `qrl(import, "name", [var1, var2])`
3. In the segment module, rewrites the function to read captures from `_captures`: `const var1 = _captures[0]`

**Exception — event handlers on native elements:** For `$`-props on native elements (e.g., `onClick$` on `<button>`), captures are instead lifted to `q:p`/`q:ps` props on the element and injected as extra function parameters. This removes the capture array from the QRL, allowing it to be hoisted to module scope. See "Event handler capture lifting" below.

### QRL Calls

The optimizer produces different QRL calls depending on context:

| Call                                                                  | When                                          |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `qrl(() => import("./path"), "name")`                                 | Prod, no captures                             |
| `qrl(importFn, "name", [captures])`                                   | Prod, with captures                           |
| `qrlDEV(() => import("./path"), "name", {file, lo, hi, displayName})` | Dev mode                                      |
| `inlinedQrl(fn, "name")`                                              | Inline/Hoist strategy                         |
| `_noopQrl("name")`                                                    | Empty or stripped segments                    |
| `_noopQrl("name", [captures])`                                        | Empty segment with captures                   |
| `_qrlSync(fn, "serialized")`                                          | `sync$()` — synchronous, serialized as string |

### QRL Hoisting

When a QRL has **no captures**, it can be hoisted to module scope as a `const` to avoid recreating it on every render:

```js
const _qrl_s_abc123 = /*#__PURE__*/ qrl(() => import('./path'), 's_abc123');
// ...used as:
componentQrl(_qrl_s_abc123);
```

When a QRL **has captures**, the `() => import()` arrow is hoisted instead (since the import function is constant), and the `qrl()` call stays inline:

```js
const i_abc123 = () => import('./path');
// ...inside function:
useTaskQrl(qrl(i_abc123, 's_abc123', [state]));
```

Note: event handler captures on native elements are lifted to `q:p`/`q:ps` props (see Captures), removing them from the QRL and enabling module-scope hoisting.

## Transformation Pipeline

The optimizer processes each source file through these phases in order:

### Phase 1: Pre-processing

1. **Parse** — SWC parses the source. File extension determines TypeScript/JSX mode.

2. **Strip exports** — If `strip_exports` is configured, matching named exports are replaced with stubs that throw at runtime. Used to remove server-only function implementations from client bundles while preserving the export shape.

3. **TypeScript strip** — SWC removes type annotations (if `transpile_ts`).

4. **JSX transform** — SWC converts JSX to `jsx()`/`jsxs()` calls using the automatic runtime from `@qwik.dev/core` (if `transpile_jsx`).

5. **Import renaming** — Rewrites legacy `@builder.io/qwik*` imports to `@qwik.dev/core*` for v1 compatibility.

6. **Resolver** — SWC assigns `SyntaxContext` to all identifiers, making each binding uniquely identifiable as a `(name, SyntaxContext)` tuple. This is critical for all subsequent scope analysis.

### Phase 2: Collection and Preparation

7. **Global collection** — Single-pass visitor that builds a registry of all imports, exports, and module-level declarations. This registry (`GlobalCollect`) is queried throughout all subsequent passes.

8. **Props destructuring** — Rewrites destructured component props to lazy property accesses for signal forwarding:

   ```ts
   // Input
   component$(({ count, label = "hi" }) => { ... })
   // Output
   component$((_rawProps) => {
     const count = _rawProps.count;
     const label = _rawProps.label ?? "hi";
     ...
   })
   ```

9. **Const replacement** — Replaces `isServer`, `isBrowser`, `isDev` (imported from `@qwik.dev/core` or `@qwik.dev/core/build`) with boolean literals based on build configuration. This enables subsequent DCE to eliminate dead branches.

### Phase 3: The Main Transform (`QwikTransform`)

10. **QwikTransform fold** — The central pass. An SWC `Fold` visitor that walks the entire AST:

    **Segment extraction:** For every call to a `$`-suffixed function:
    - Renames the callee: `useTask$` → `useTaskQrl`, `component$` → `componentQrl`
    - Extracts the closure argument into a `Segment` struct
    - Computes a deterministic symbol name from the naming context stack + file hash
    - Identifies captured variables from the lexical scope
    - Replaces the closure with a `qrl()` call (or `inlinedQrl()` for inline strategies)
    - If `strip_ctx_name` matches (e.g., `"server"` for `serverStuff$`), emits `_noopQrl()` instead

    **JSX transformation:** Converts `jsx(type, props, key)` calls to Qwik's internal format:
    - Classifies props as **const** (remains constant through the JSX node lifetime; static value or ref) or **var** (all the rest)
    - Event handler props (`onClick$`, etc.) on native elements: extracts the handler into a segment, renames to internal attribute form (`q-e:click`)
    - `bind:value` / `bind:checked`: expands to value prop + synthetic input event handler, on native elements, when `const`
    - `className` → `class` on native elements
    - Spread props: split into `_getVarProps(obj)` and `_getConstProps(obj)`
    - Non-const, non-JSX children wrapped in `_fnSignal` for lazy signal reading
    - Auto-generates stable keys for components and root-level JSX
    - Computes optimization flags (bit 0: static listeners, bit 1: static subtree, bit 2: has `q:p`/`q:ps` params)
    - Final call: `_jsxSorted(type, varProps, constProps, children, flags, key)` or `_jsxSplit(...)` (when runtime prop sorting is needed due to spreads)

    **Event handler capture lifting:** For event handler `$`-props on native elements (e.g., `onClick$`, `onInput$`), captured variables from the enclosing scope are extracted from the QRL's capture array and moved to `q:p` / `q:ps` props on the element. The handler function receives these values as extra parameters (after the standard `event` and `element` params). This removes the captures from `scoped_idents`, allowing the QRL to be hoisted to module scope. When multiple handlers share an element, the union of all captures is computed and each handler receives all of them (with `_` placeholders for unused ones). Inside loops (`.map()`, `.filter()`, etc.), iteration variables are similarly tracked and lifted via the same mechanism.

    **`sync$` handling:** Transforms `sync$(fn)` into `_qrlSync(fn, serializedString)` where the function is serialized to a string representation.

    **Const initializer inlining:** Tracks `const` variable initializers post-fold. When a `$`-call receives a simple identifier referencing a local const (e.g., `useStyles$(style)` where `const style = \`...\``), the initializer is inlined into the segment.

    **Module assembly:** After folding all items, the transform:
    - Adds synthetic imports needed by generated code
    - Hoists `extra_top_items` (QRL consts, import arrow consts) to module scope
    - Topologically sorts declarations by dependency order
    - Appends auto-export statements for identifiers that segments reference

### Phase 4: Dead Code Elimination

11. **Pre-DCE side effect marking** — Records which top-level call/new expressions exist before DCE.

12. **DCE (Dead Code Elimination)** — SWC's simplifier removes unreachable code, unused variables, and simplifies constant expressions. This is where `if (false) { ... }` branches (from const replacement) get eliminated.

13. **Post-DCE cleanup** — For client builds, removes top-level call/new expressions that were _introduced_ by DCE (i.e., weren't in the original code). Also ensures relative-import side effects are preserved for inline strategies.

### Phase 5: Variable Migration

14. **Dependency analysis** — Analyzes which module-level variables are used by only one segment and aren't user-exported. These can be moved into the segment's module to reduce root module size.

    The analysis:
    - Builds a dependency graph of root-level declarations
    - Maps each root variable to the segments that reference it
    - Variables used by exactly one segment, not user-exported, and not imported are candidates
    - Transitively includes dependencies of candidates (if they're also safe to move)
    - Iterative safety check: ensures no remaining root declaration depends on a migrated variable

    After migration, removes the moved declarations and their auto-exports from the root module, then re-runs DCE to clean up.

### Phase 6: Segment Module Generation

15. **Build segment modules** — For each extracted segment, builds a standalone ES module:
    - Resolves imports: identifiers referencing source-file imports get corresponding import declarations; identifiers referencing source-file exports get `import { _auto_name } from "./sourceFile"`
    - Adds `_captures` import and rewrites function parameters if the segment has captures
    - Includes hoisted QRL consts and migrated root variables
    - Topologically sorts all declarations

16. **Segment DCE** — Runs DCE on each segment module to remove unused imports and dead code.

17. **Empty segment detection** — After DCE, checks if a segment's exported function body is empty (no statements, only `_captures[N]` accesses, `() => undefined`, or `() => void 0`). Empty segments are not emitted.

18. **Noop QRL replacement** — In all remaining modules (root + non-empty segments), `qrl()` calls referencing empty segments are replaced with `_noopQrl()`. The captures array is preserved. Unused import arrows (`i_*` consts) and QRL declarations (`_qrl_*` consts) are cleaned up.

### Phase 7: Emission

19. **Hygiene + fixer** — SWC renames variables to avoid collisions and ensures syntactically valid output.

20. **Code generation** — SWC's emitter produces final JavaScript and optional source maps.

### Output

The optimizer returns a `TransformOutput` containing:

- A list of `TransformModule` structs, each with code, source map, path, and optional `SegmentAnalysis` metadata
- The first module is always the root (the transformed source file)
- Subsequent modules are the extracted segments
- Diagnostics (errors/warnings)

## Symbol Naming

Segment symbol names are derived from a **naming context stack** that tracks the path through the component tree:

```
ComponentName > hookName > nestedContext > ...
```

The display name is built by joining the stack with `_`, prepended by the filename. A hash is computed from the file path + scope + display name and encoded as base64.

- **Dev/Test mode:** `displayName_hash` (e.g., `App_component_useTask_abc123`)
- **Prod mode:** `s_hash` (e.g., `s_abc123`)

The hash ensures uniqueness. Duplicate names within a file get a numeric suffix.

## Entry Strategies

The entry strategy determines how segments are grouped into output files:

| Strategy    | Behavior                                                                                 | QRL type                  |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| `Segment`   | One file per segment                                                                     | `qrl(() => import(...))`  |
| `Hook`      | One file per segment (same as Segment)                                                   | `qrl(() => import(...))`  |
| `Component` | Segments grouped by root component                                                       | `qrl(() => import(...))`  |
| `Smart`     | Event handlers without captures get separate files; everything else grouped by component | `qrl(() => import(...))`  |
| `Single`    | All segments in one chunk                                                                | `qrl(() => import(...))`  |
| `Inline`    | No separate files; closures stay in source                                               | `inlinedQrl(fn, "name")`  |
| `Hoist`     | Like Inline but hoisted as `const` before usage                                          | `inlinedQrl(ref, "name")` |

The `EntryPolicy` trait's `get_entry_for_sym()` returns `Some(chunkName)` to group segments or `None` for a standalone file.

## Build Configuration

Key configuration options that affect output:

| Option                       | Effect                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `mode: Dev`                  | Uses `qrlDEV()` / `_noopQrlDEV()` with source locations; uses readable symbol names |
| `mode: Prod`                 | Uses `qrl()` / `_noopQrl()`; uses short `s_hash` symbol names                       |
| `is_server: true`            | `isServer=true`, `isBrowser=false` — server-only code kept, client-only DCE'd       |
| `is_server: false`           | `isServer=false`, `isBrowser=true` — client-only code kept, server-only DCE'd       |
| `strip_ctx_name: ["server"]` | Calls like `serverStuff$(...)` emit `_noopQrl()` instead of extracting              |
| `strip_event_handlers: true` | Event handler `$` props emit `_noopQrl()`                                           |
| `strip_exports: ["loader"]`  | Named export `loader` replaced with throwing stub                                   |
| `minify: Simplify`           | Enables DCE and constant folding                                                    |
| `transpile_ts: true`         | Strip TypeScript types                                                              |
| `transpile_jsx: true`        | Transform JSX syntax                                                                |

## JSX Transformation Details

Qwik's JSX uses a split props model for optimization:

```ts
// Input
<div class="foo" onClick$={() => handle()} title={expr}>
  {child}
</div>

// Output
_jsxSorted("div",
  null,                              // varProps (null = none)
  { class: "foo",                    // constProps
    "q-e:click": _qrl_handler,       // event → const (no captures = static)
    title: expr },                   // if expr is const
  _fnSignal(() => child, [child]),   // children wrapped for lazy reading
  3,                                 // flags: static_listeners | static_subtree
  null                               // key (null = no key for native elements)
)
```

### Prop Classification

- **const props:** Scalars and const refs. Frozen at render time. Note that if the ref is a Signal, it can still change the prop, but this happens directly without re-rendering the JSX node.
- **var props:** Everything else, re-evaluated on updates.
- **Event handlers** (`*$` on native elements): Extracted as segments. The prop key is transformed: `onClick$` → `q-e:click`, `onDocumentScroll$` → `q-d:scroll`, `onWindowResize$` → `q-w:resize`. When multiple handlers for the same event exist, they get merged into an array: `q-e:click=[handler1, handler2]`.

### Bind Props

`bind:value={signal}` expands to:

- `value={signal}` (the signal itself, not `.value`)
- `q-e:input={_val_qrl}` (a synthetic input handler that updates the signal)

Similarly for `bind:checked`.

This only happens on native elements and when the bound expression is classified as `const`. Otherwise, this happens at runtime.

### Event Handler Capture Lifting (`q:p` / `q:ps`)

When event handlers on native elements capture variables from their enclosing scope, those captures are lifted out of the QRL and onto the element as `q:p` (single capture) or `q:ps` (multiple captures) props. The handler function receives the lifted values as extra parameters after `(event, element)`. Unused captures get `_` placeholder params.

This enables QRLs to have no captures, allowing them to be hoisted to module scope. The `q:p`/`q:ps` prop is always emitted as a **varProp** since the captured values are dynamic.

```ts
// Input
<button onClick$={() => sig.value++} onDblClick$={() => foo.value += sig.value}>

// Output (in component segment)
_jsxSorted("button",
  { "q:ps": [foo, sig] },           // varProps: lifted captures
  { "q-e:click": _qrl_click,        // constProps: hoisted QRL refs
    "q-e:dblclick": _qrl_dblclick },
  ...
)

// Segment: click handler
export const s_click = (_, _1, _2, sig) => sig.value++;
//                      ^event ^el  ^foo(unused) ^sig

// Segment: dblclick handler
export const s_dblclick = (_, _1, foo, sig) => foo.value += sig.value;
```

The union of captures is computed across all event handlers on the element, sorted by identifier. Each handler receives all captures in the same order — unused ones are given placeholder names (`_`, `_1`, `_2`, ...).

This mechanism also handles **loop iteration variables**: inside `.map()`, `.filter()`, etc., the iteration parameters are tracked and lifted via the same `q:p`/`q:ps` system, allowing handlers in loops to be hoisted out of the loop body.

## Noop QRL Handling

A segment becomes a **noop** when:

1. **Strip at transform time:** `strip_ctx_name` matches the hook name (e.g., server-only hooks on client builds) or `strip_event_handlers` is set
2. **Empty after DCE:** The segment body becomes empty after dead code elimination (e.g., `useTask$(() => { if (isServer) { ... } })` on a client build where `isServer=false`)
3. **Always empty:** The segment body was written as empty (`$(() => {})`, `$(function() {})`, `$(() => undefined)`)

Noop QRLs:

- Don't generate a segment file
- Use `_noopQrl("symbolName")` (or `_noopQrlDEV(...)` in dev mode)
- Preserve the captures array if present: `_noopQrl("name", [captured])`

## File Layout

```
packages/optimizer/core/src/
├── lib.rs                  # Crate root, public API
├── parse.rs                # Main pipeline orchestration, segment emission
├── transform.rs            # QwikTransform fold — segment extraction, JSX, QRL creation
├── code_move.rs            # Segment module builder (new_module)
├── collector.rs            # Import/export/root-declaration registry (GlobalCollect)
├── const_replace.rs        # isServer/isBrowser/isDev → boolean literals
├── entry_strategy.rs       # Entry strategy definitions and policies
├── dependency_analysis.rs  # Variable migration analysis
├── props_destructuring.rs  # Component props → lazy property access
├── filter_exports.rs       # Export stripping (server-only removal)
├── rename_imports.rs       # @builder.io/* → @qwik.dev/* compatibility
├── add_side_effect.rs      # Side-effect import preservation
├── clean_side_effects.rs   # Post-DCE treeshaker
├── words.rs                # All recognized symbol names as Atom constants
├── utils.rs                # Diagnostics, source location helpers
└── test.rs                 # Snapshot tests
```

## Testing

Run all tests:

```shell
pnpm test.rust
```

Run a single test with debug output:

```shell
cargo test -p qwik-core PARTIAL_NAME_OF_TEST -- --nocapture
```

Update snapshots:

```shell
pnpm test.rust.update
```

Each test calls `test_input!` with a `TestInput` struct specifying source code and configuration, then asserts the full output (all emitted modules + diagnostics) against a snapshot file in `src/snapshots/`.
