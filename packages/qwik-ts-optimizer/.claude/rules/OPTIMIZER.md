# Optimizer end-to-end walkthrough

A spine for understanding what `transformModule` actually does to a Qwik source file. Use the example walkthrough as the entry point; drill into the deep-dive sections when you need to extend a phase.

This is a **stable rule file** like `METHODOLOGIES.md` and `LINEAR.md` — not branch-scoped. Update it when the pipeline shape, phase numbering, or core extraction model changes; mid-investigation findings belong elsewhere.

---

## What the optimizer does, in one sentence

It takes a Qwik source file, finds every `$()` closure, lifts each one into its own lazy-loadable module, and rewrites the original file so that the closures become `qrl(() => import(...))` references — the runtime then lazy-loads each chunk only when the user triggers it.

---

## Two namespaces: what you write vs what the optimizer produces

The optimizer transforms one canonical surface into another. The single most useful disambiguator when reading code is asking: **which side of the line does this name live on?**

**Author surface** — what a developer actually writes:

- `$(closure)` — "lazy-load this closure"
- `component$`, `useTask$`, `useStyles$`, `useVisibleTask$`, `serverStuff$`, etc. — the `$`-suffixed marker family
- Regular JSX, regular ES modules, regular bindings

**Tool surface** — what the optimizer (or a peer codegen tool like `qwik-react`) emits, intended for the Qwik runtime to consume. A developer should almost never write any of these by hand:

| Name shape | Role | Where it's emitted |
|---|---|---|
| `inlinedQrl(fn, "name", [captures])` | Pre-extracted QRL spec — the closure has already been analysed and is being handed to the optimizer fully-baked | Peer tools (`qwik-react`); idempotency cases |
| `qrl(() => import("./..."), "name")` | Lazy-loadable QRL reference for one segment | Phase 4 parent rewrite, Phase 5 segment imports |
| `componentQrl(...)`, `useTaskQrl(...)`, `useStylesQrl(...)`, etc. | Already-named-Qrl form of a marker; replaces `component$(fn)` with `componentQrl(q_<symbol>)` | Phase 4 parent rewrite |
| `q_<symbol>` | Optimizer-generated `qrl(...)` constant binding; one per segment, lives in either parent or owning segment | Phase 4 / Phase 5 |
| `_captures`, `_captures[i]` | Capture serialisation array; runtime injects the bound values when calling the segment | Phase 5 capture imports + injection |
| `_rawProps` | Convention name for un-destructured component props when a child segment captures a destructured prop field | Phase 4 props consolidation |
| `_auto_<name>` | Compiler-generated re-export prefix; distinguishes from user `export` statements | Phase 3 `reexport` decisions emitted in Phase 4 |
| `_jsxSorted(tag, varProps, constProps, children, flags, key)` | JSX helper output; replaces user `<div ... />` syntax post-transform | JSX rewrite (full module, per-segment Phase 5) |
| `_jsxSplit(...)` | Variant of `_jsxSorted` for spread or `bind:` cases | JSX rewrite |
| `_fnSignal(_hf<n>, [deps], str)` | Hoisted reactive expression call; `_hf<n>` is the lifted arrow form, `str` is its serialised body | `signal-analysis.ts` |
| `_wrapProp(props, "bind:value")` | Two-way-binding wrapper for `bind:` directives that cross a boundary | JSX rewrite |
| `_noopQrl(...)`, `_noopQrlDEV(...)` | Stripped-segment placeholder (segment was elided per `stripCtxName` / `stripEventHandlers`) | Phase 5 inline-strategy emit |
| `.w([captures])` | "with captures" QRL method; emitted on parent-side QRL refs that need to pass values to the segment | Phase 4 parent rewrite |
| `.s(body)` | "set body" QRL method; only used by inline entry strategy | Phase 5 inline-strategy emit |
| `useHmr(devFile)` | Auto-injected HMR hook for component segments in dev/hmr mode | Phase 6 `postProcessSegmentCode` |

If you see one of those names in source someone hand-wrote, it's almost certainly a peer tool's output (e.g. `qwik-react` codegen) or a hand-crafted test fixture — not idiomatic developer code. If you see one of those names in optimizer output, it's machinery and you can trace it to the function in code that emits it.

### The marker family triad

A specific instance of the author/tool boundary that recurs throughout the codebase: every `$`-suffixed marker has **three forms** and the optimizer treats them differently in different phases.

| Form | Who writes it | When it appears |
|---|---|---|
| `component$(fn)` | Developer | Source code, before extraction |
| `componentQrl(qrlConst)` | Optimizer (parent rewrite) or peer tool (`inlinedQrl(componentQrl(...), ...)`) | After extraction; the developer-marker has been replaced by the QRL form |
| `ctxName === 'component'` | Optimizer (inline-strategy emit only) | A synthesised ctxName used internally during inline-strategy hoisting; never appears as identifier in emitted code |

The OSS-344 predicate split mirrors this directly: `isComponentCtx(ctxName)` matches the two-arm `component$ \| componentQrl` (pre-extraction); `isAnyComponentCtx(ctxName)` adds the post-extraction `'component'` form (three-arm). See `src/optimizer/rewrite/predicates.ts`.

### The marker catalog

The optimizer's marker-detection rule is **structural, not enumerated** (`marker-detection.ts:206`): any function call whose callee's *original imported name* ends with `$` triggers extraction, including renamed imports. Same rule applies to JSX attributes — `onClick$`, `bind:value$`, custom `*$` attrs all extract their value. The list below isn't a closed set; new library-defined `name$` functions extract automatically.

These are the markers that actually appear in convergence snapshots and Qwik core's expected import surface. **Every marker below shares the three-form triad shape above** (`xName$` → `xNameQrl(q_<symbol>)` → `'xName'` ctxName) — the catalog is just specifying which markers exist, not redefining how each is processed.

| Category | Marker | Definition |
|---|---|---|
| **Component** | `component$(fn)` | Define a Qwik component; body becomes a lazy-loadable segment, renders only at hydration boundary |
| **Lifecycle / task** | `useTask$(fn)` | Reactive side-effect; runs eagerly server-side during SSR, reruns on signal/store dependency changes |
|  | `useVisibleTask$(fn)` | Client-only `useTask$` deferred until the component is intersection-observed visible |
|  | `useMount$(fn)` | Run once during component mount on whichever side instantiates the component |
|  | `useClientMount$(fn)` | `useMount$` client-only; stripped from server bundles via `stripCtxName` |
| **State / data** | `useResource$(fn)` | Async data resource with `Resource<T>` loading/resolved/rejected states the runtime can stream |
|  | `useComputed$(fn)` | Derived signal — recomputes when any read signal/store changes |
|  | `useMemo$(fn)` | Memoised computation; runs once per dependency change |
|  | `useAsync$(fn)` | Async closure for non-resource async work (deferred until awaited) |
| **Styles** | `useStyles$(stringOrFn)` | Inject component CSS, deduplicated across instances |
|  | `useStyle$(stringOrFn)` | Singular variant |
|  | `useStylesScoped$(stringOrFn)` | CSS scoped to component instance via attribute selector |
| **Routing** | `usePreventNavigate$(fn)` | Predicate gating client-side navigation away from current route |
| **Boundary** | `server$(fn)` | Server-only body, callable from client as async RPC; stripped from client bundles |
| **JSX attr (HTML)** | `on*$`, `document:on*$`, `window:on*$` | `eventHandler` ctxKind; runtime wires the lazy QRL to DOM listeners |
| **JSX attr (component)** | Any `*$` attribute on a component element | `jSXProp` ctxKind; passed into the child component as a lazy QRL ref |

Three markers break the uniform treatment:

| Marker | Why it's special |
|---|---|
| `$(fn)` | The bare base marker — no naming context. Symbol name derives from the call-site / JSX surroundings via `getDirectWrapperContextName` (`extract.ts:388–404`) |
| `sync$(fn)` | Recognised but **does not extract** (`marker-detection.ts:222`, `isSyncMarker`). Body stays inline as a literal callback for QRL APIs that need a function reference rather than a lazy ref |
| `implicit$FirstArg(fn, ...)` | Meta-marker; lets a non-`$`-suffixed function be treated as if its first argument were `$()`-marked. Backbone of `qwik-react`'s `qwikify$`. Resolved via `customInlined` map in `extract.ts:300` (`resolveCanonicalCalleeName`) |

---

## Before / after — `example_1`

**Input** (`match-these-snaps/qwik_core__test__example_1.snap` lines 9–19):

```tsx
import { $, component, onRender } from '@qwik.dev/core';

export const renderHeader1 = $(() => {
    return (
        <div onClick={$((ctx) => console.log(ctx))}/>
    );
});
const renderHeader2 = component($(() => {
    console.log("mount");
    return render;
}));
```

**Output** — the optimizer emits **4 modules** for this one file:

### 1. The rewritten parent `test.tsx` (snap lines 52–59)

```ts
import { qrl } from "@qwik.dev/core";
import { component } from '@qwik.dev/core';
//
const q_renderHeader1_jMxQsjbyDss = /*#__PURE__*/ qrl(()=>import("./test.tsx_renderHeader1_jMxQsjbyDss"), "renderHeader1_jMxQsjbyDss");
const q_renderHeader2_component_Ay6ibkfFYsw = /*#__PURE__*/ qrl(()=>import("./test.tsx_renderHeader2_component_Ay6ibkfFYsw"), "renderHeader2_component_Ay6ibkfFYsw");
//
export const renderHeader1 = q_renderHeader1_jMxQsjbyDss;
component(q_renderHeader2_component_Ay6ibkfFYsw);
```

The two top-level `$()` calls became `q_<symbol>` references. The unused `$` and `onRender` imports got dropped. `qrl` got injected because we now use it.

> Everything in this output that starts with `q_`, `_`, or is `qrl(...)` / `componentQrl(...)` is **tool-emitted**, not author-written — see [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces) for the full convention list.

### 2. Segment for `renderHeader1`'s body — `test.tsx_renderHeader1_jMxQsjbyDss.tsx` (snap lines 65–71)

```ts
import { qrl } from "@qwik.dev/core";
//
const q_renderHeader1_div_onClick_USi8k1jUb40 = /*#__PURE__*/ qrl(()=>import("./test.tsx_renderHeader1_div_onClick_USi8k1jUb40"), "renderHeader1_div_onClick_USi8k1jUb40");
//
export const renderHeader1_jMxQsjbyDss = ()=>{
    return <div onClick={q_renderHeader1_div_onClick_USi8k1jUb40}/>;
};
```

The body of the original `$(() => { return <div ... /> })` becomes the named export. The nested `$((ctx) => ...)` got hoisted out and replaced with a `q_...` reference — and **this segment, not the parent, owns the `qrl()` declaration for the click handler**, because this is the only place that references it.

### 3. Segment for the nested `onClick` handler — `test.tsx_renderHeader1_div_onClick_USi8k1jUb40.tsx` (snap line 23)

```ts
export const renderHeader1_div_onClick_USi8k1jUb40 = (ctx)=>console.log(ctx);
```

The leaf — no captures, no imports, just the closure body exported by name. The runtime only loads this chunk after the user clicks.

### 4. Segment for `renderHeader2`'s body — `test.tsx_renderHeader2_component_Ay6ibkfFYsw.tsx` (snap lines 97–100)

```ts
export const renderHeader2_component_Ay6ibkfFYsw = ()=>{
    console.log("mount");
    return render;
};
```

Note `render` is referenced but unresolved — the optimizer doesn't track that as a capture (it's not in any in-scope binding), so it's left as a free identifier. That's a separate-input runtime concern; the optimizer just preserves the reference.

---

The **chain of laziness** for this file:

1. App boot pulls in `test.tsx` (parent only) — ~6 lines of QRL declarations and re-exports, no closure bodies.
2. Some caller invokes `renderHeader1` → runtime resolves `q_renderHeader1_jMxQsjbyDss` → fetches segment #2.
3. The user clicks the rendered `<div>` → runtime resolves `q_renderHeader1_div_onClick_USi8k1jUb40` → fetches segment #3.

Each segment is ~1–3 lines of business logic. That granularity is the whole point.

---

## The pipeline

Top-level entry is `transformModule` at `src/optimizer/transform/index.ts:93`. The header comment names six conceptual phases (`extract → analyze → migrate → rewrite parent → generate segments`), but in code there are 7 numbered phase markers.

| Phase | Marker | What it does | Key code |
|---|---|---|---|
| 0 | `transform/index.ts:108` | Repair SWC-recoverable parse errors | `repairInput` |
| 1 | `transform/index.ts:131` | Walk the AST, find every `$(...)` call, record loc + body text + initial metadata | `extractSegments` in `extract.ts` |
| 2 | `transform/index.ts:171` | Collect imports + run scope analysis on each closure to determine which outer-scope vars are captured. Closure AST nodes are threaded through from Phase 1 (`closureNodes` map populated by `extractSegments` per OSS-353); no per-extraction body re-parse | `collectScopeIdentifiers`, `analyzeCaptures`, `computeSegmentUsage` |
| 3 | `transform/index.ts:352` | For each module-level binding referenced inside a segment, decide: stay in parent (`keep`), move into segment (`move`), or re-export (`reexport`) | `decideMigration` in `variable-migration.ts` |
| 4 | `transform/index.ts:490` | Rewrite the parent module — replace each `$(closure)` with a generated `q_<symbol>` `qrl(...)` reference; apply migration decisions | `rewriteOriginalModule` |
| 5 | `transform/index.ts:605` | Emit one module per non-stripped segment | `generateAllSegmentModules` in `transform/segment-generation.ts` (34-line sequencer over named helpers per OSS-356/357/358 — see SPEC at `.planning/specs/segment-generation-refactor.md`) |
| 6 | `transform/index.ts:686` | Apply diagnostic suppression directives | (lightweight cleanup) |

The all-segments orchestrator `generateAllSegmentModules` (`segment-generation.ts:1127`) is a 34-line sequencer over six named helpers: `computeSegmentGenerationPrep` (per-call setup), `buildInlineStrategySegment` (inline/hoist branch), `buildDefaultStrategySegment` (default branch sequencer), and three sub-helpers `buildNestedQrlDeclarations` / `wireMigration` / `buildNestedCallSites` plus a shared `consolidateRawPropsCaptures`. Refactor track v2 (OSS-356/357/358) extracted these from a 580-line monolith; full design rationale at [`.planning/specs/segment-generation-refactor.md`](../../.planning/specs/segment-generation-refactor.md).

Phase 5's per-segment work flows through `generateSegmentCode` (`segment-codegen.ts:595` — refactored in OSS-346 into a 9-phase sequencer with extracted helpers `collectInitialImports` and `applyBodyTransforms`) followed by `postProcessSegmentCode` (`transform/post-process.ts:158`).

---

## Tracing `example_1` through the phases

### Phase 1 — extraction (`src/optimizer/extract.ts`)

Walks the AST looking for `$(...)` calls. For `example_1` it finds 3:

| symbolName (initial) | bodyText (closure source) | parent | location |
|---|---|---|---|
| `renderHeader1_jMxQsjbyDss` | `() => { return <div onClick={...}/>; }` | `null` | line 11 of input |
| `renderHeader1_div_onClick_USi8k1jUb40` | `(ctx) => console.log(ctx)` | `renderHeader1_jMxQsjbyDss` | line 13 |
| `renderHeader2_component_Ay6ibkfFYsw` | `() => { console.log("mount"); return render; }` | `null` | line 16 |

Each row's `symbolName` is composed in four steps from a context-stack walk during AST traversal: build a `displayName` from the stack, hash it with SipHash-1-3, append the hash. Full mechanics (including disambiguation when contexts collide and the prod-mode `s_<hash>` rename) live in [Symbol naming and hashing](#symbol-naming-and-hashing) under the metadata deep dive.

### Phase 2 — capture analysis (`transform/index.ts:171–323`)

For each closure body, parses it again (`parseWithRawTransfer`), collects identifiers in scope, and walks the body looking for free variables that resolve to outer scope. None of the `example_1` closures actually capture anything — `ctx` is an inner param, `render` is referenced but unbound (not tracked), `console` is global. The metadata block at snap line 40 confirms: `"captures": false`.

For a richer demo of this phase, see the **capture analysis** deep dive below.

### Phase 3 — migration (`variable-migration.ts:decideMigration`)

For each module-level declaration, check whether it's referenced from any segment. The decisions:

- `renderHeader1` — declared and referenced at module level only → **keep** (parent keeps it).
- `renderHeader2` — same → **keep**.
- The `onRender` and `$` imports — never used in any segment body → **drop** (you can see them gone from the parent rewrite at snap line 53).

For a richer demo, see the **migration policy** deep dive below.

### Phase 4 — parent rewrite (`rewriteOriginalModule`)

Now we rewrite `test.tsx`:

1. **Replace each `$(closure)` with `q_<symbol>`** — the original `$(() => { return <div ... /> })` becomes just `q_renderHeader1_jMxQsjbyDss`. This produces snap line 58.
2. **Inject `qrl()` declarations** for each top-level segment — produces snap lines 55–56. The nested onClick segment doesn't appear here because its `qrl()` lives in `renderHeader1`'s segment file (it's only referenced from there).
3. **Inject `import { qrl } from "@qwik.dev/core"`** — produces snap line 52.
4. **Strip unused imports** — `$` and `onRender` from the original import, leaving just `component`.
5. **Apply migration decisions** — for `example_1`, all decisions are KEEP, so nothing to move/re-export.

### Phase 5 — segment generation (`segment-generation.ts:generateAllSegmentModules` → `segment-codegen.ts:generateSegmentCode`)

For each segment, `generateSegmentCode` runs the 9-phase sequencer at `segment-codegen.ts:595`. Walking through the renderHeader1 segment:

| Sub-phase | Effect on this segment |
|---|---|
| 1–3 (`collectInitialImports`) | Build initial `parts[]`. For renderHeader1: emits `import { qrl } from "@qwik.dev/core"`. No captures so no `_captures` import. |
| 4 (`applyBodyTransforms`) | Take the body text `() => { return <div onClick={$((ctx) => ...)}/>; }` and rewrite the nested call site: `$((ctx) => ...)` becomes a reference to `q_renderHeader1_div_onClick_USi8k1jUb40` (and emits the matching `qrl()` declaration into `parts`). |
| 5 (JSX) | If JSX transpilation is enabled, this is where `<div ... />` becomes `_jsxSorted("div", ...)`. For example_1's snap, JSX is preserved because the test runs without `transpileJsx`. |
| 6 (core imports + sync$) | No `sync$` calls, no-op for example_1. |
| 7 (normalize separators) | The `//` markers in snap output are sentinel separators from this pass. |
| 8 (post-transform import re-collection) | Walks the final body for unreferenced symbols to drop and any newly-needed imports to add. |
| 9 (DCE + emit) | `parts.push("export const renderHeader1_jMxQsjbyDss = () => { ... };")` and join. |

For the leaf onClick segment, the same pipeline runs — but the body is just `(ctx) => console.log(ctx)`: no captures, no nested call sites, no imports. It comes out as the one-liner at snap line 23.

### Phase 6 — post-process per segment (`transform/post-process.ts:postProcessSegmentCode`)

Each emitted segment string then goes through `postProcessSegmentCode` (called from `transform/segment-generation.ts:1048` inside `buildDefaultStrategySegment`):

1. TypeScript strip via `oxc-transform`.
2. Const replacement (`applySegmentConstReplacement`).
3. Dead-code elimination (`applySegmentDCE`).
4. Side-effect simplification.
5. HMR `useHmr()` injection — only fires for `component$` segments via `isAnyComponentCtx` from `rewrite/predicates.ts`.
6. **`removeUnusedImports`** (`module-cleanup.ts:322`) — strips imports that downstream transforms made unreferenced. This is what upholds the per-segment "only contains referenced imports" invariant in the face of upstream over-emission.

---

## Deep dive: capture analysis

A "capture" is an identifier referenced inside a segment closure that resolves to a binding in the enclosing scope (parent function or module). Captures cross the lazy-load boundary, so the optimizer has to thread them explicitly via the `_captures` array.

### What gets captured (and what doesn't)

A name is a capture iff:
- It's referenced inside the closure body.
- It resolves to a binding declared in a parent scope (not a local, not an import).
- It's not classified as a function or class declaration (`classifyDeclarationType` in capture-analysis.ts filters those out — they don't get serialised).
- It's not a closure parameter that shadows the outer name.

Globals (`console`, `Math`, `window`) are not captured because they aren't declared anywhere in source. Imports aren't captured because they're re-imported in the segment file directly.

### Algorithm

Two functions, both in `src/optimizer/capture-analysis.ts`:

- **`collectScopeIdentifiers`** (`capture-analysis.ts:68`) — recursively walks a container (Program, BlockStatement, FunctionBody, Function). Returns a `Set<string>` of every name that's declared inside it: var/const/let bindings (including destructure patterns), function and class names, function parameters.
- **`analyzeCaptures`** (`capture-analysis.ts:35`) — for one closure: calls `getUndeclaredIdentifiersInFunction()` (from oxc-walker) to find free variables, intersects with the parent scope's identifiers (so we keep only outer-scope refs, not globals), filters out imports, filters out function/class declaration names. Returns sorted, deduplicated `string[]`.

The orchestration lives in `transform/index.ts:171–323`. For each extraction it:

1. Looks up the closure AST node from the `closureNodes` map populated by Phase 1's `extractSegments` (OSS-353 — replaced an earlier per-extraction body re-parse with a single canonical AST walk; the closure node carries its own source-absolute positions so diagnostics align with the original file).
2. Picks the right parent scope: if the closure is nested inside another extraction, the parent is the outer extraction's body scope; otherwise it's the module scope.
3. Calls `analyzeCaptures` to populate `extraction.captureNames`.
4. Sets `extraction.captures = captureNames.length > 0`.

### Two populating paths: `$()` (developer) vs `inlinedQrl` (tool)

There are **two completely separate code paths** for populating `captureNames`, and which one runs depends entirely on whether a developer or a tool wrote the source:

**Path A: regular `$()` — author-written, optimizer infers everything.**
- `transform/index.ts:230–290` calls `analyzeCaptures` to walk the closure scope.
- The captures list is **derived** from what variables the closure references.
- The body does not yet contain `_captures[i]` references; the optimizer injects the unpacking line during Phase 5.

**Path B: `inlinedQrl(fn, "name", [captures])` — tool-written, optimizer trusts the spec.**
- `transform/index.ts:207–225` parses the explicit `[captures]` array directly from the source.
- The captures list is **declared**, not derived. The optimizer doesn't re-analyse — it trusts the upstream tool got it right.
- The body **already contains** `const x = _captures[0]` lines (the upstream tool wrote them). Phase 5 sets `skipCaptureInjection: true` and doesn't inject a duplicate unpacking.
- `inlinedQrl`'s captures array can contain non-identifier expressions — `[left, true, right]` is valid (see `should_preserve_non_ident_explicit_captures.snap`). Regular `$()` can't express this; only the explicit form can.

**Where you'll actually encounter `inlinedQrl`:**

1. **Interop library codegen.** `qwik-react` and similar frameworks have their own pre-processor that emits `inlinedQrl` directly because they've already done the analysis and want to hand the optimizer a fully-baked QRL. See `match-these-snaps/qwik_core__test__example_qwik_react.snap` lines 14–48 — every `inlinedQrl` there came from `qwikify$`'s codegen, not a developer's keyboard.
2. **Idempotency.** When the optimizer runs over its own output (or a build pipeline that re-invokes it), it sees `inlinedQrl` calls left from a prior pass. Detection at `extract.ts:600–745` runs *before* the regular `$()` walker so these don't get double-extracted.
3. **Hand-crafted test fixtures.** Snapshots like `should_preserve_non_ident_explicit_captures.snap` use `inlinedQrl` to exercise edge cases (non-identifier captures, explicit naming) the regular form can't reach.

> **Rule of thumb.** Developers write `$()`. Tools write `inlinedQrl`. If you're hand-writing `inlinedQrl` you almost certainly want `$()` instead.

This pairs with the broader author-vs-tool boundary documented in [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces).

`computeSegmentUsage` (`variable-migration.ts:358`) is a separate pass that walks the program once and produces a map of `segmentName → Set<moduleName>` plus a `rootUsage` set. This drives migration (Phase 3); it overlaps conceptually with `captureNames` but operates at module-decl granularity, not closure-scope granularity.

### Worked example — `example_multi_capture`

Input (`match-these-snaps/qwik_core__test__example_multi_capture.snap` lines 11–21):

```tsx
export const Foo = component$(({foo}) => {
    const arg0 = 20;
    return $(() => {
        const fn = ({aaa}) => aaa;
        return (
            <div>
                {foo}{fn()}{arg0}
            </div>
        )
    });
})
```

The inner `$()` closure references three free identifiers: `foo` (parent's destructured prop), `fn` (local — not a capture), `arg0` (parent's const).

Output segment (`Foo_component_1_DvU6FitWglY`, snap lines 122–130):

```jsx
import { _captures } from "@qwik.dev/core";
//
export const Foo_component_1_DvU6FitWglY = ()=>{
    const _rawProps = _captures[0];
    const fn = ({ aaa })=>aaa;
    return <div>
                {_rawProps.foo}{fn()}{20}
            </div>;
};
```

Three things happened (all of `_rawProps`, `_captures`, `.w([...])` are tool-surface — see [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces)):

1. **`foo` got consolidated to `_rawProps`.** When a parent's destructured prop is captured, the optimizer rewrites both sides — the parent passes `_rawProps` (the un-destructured object), and the segment reaches into `_rawProps.foo` instead. This is the F3 territory in `CONVERGENCE_FAILURES.md`. After the OSS-356/357/358 split, the consolidation work is delegated to `consolidateRawPropsCaptures` (`segment-generation.ts:290`) which is called from both strategy paths: `buildInlineStrategySegment` at line 419 and `buildDefaultStrategySegment` at line 964.
2. **`arg0` got inlined as `20`.** Const-literal captures whose values are statically resolvable get folded at codegen time and dropped from `captureNames`. Logic at `segment-generation.ts:974` (wires the pre-computed const-literal map into the default-strategy path) and `inlineConstCaptures` in `rewrite/index.ts`.
3. **The captureNames metadata is just `["_rawProps"]`.** The unpacking line `const _rawProps = _captures[0]` is injected by `injectCapturesUnpacking` (`segment-codegen/body-transforms.ts:543`) at the start of the segment body.

The parent segment passes the captures via `.w([_rawProps])` (snap line 40):

```jsx
export const Foo_component_HTDRsvUbLiE = (_rawProps)=>{
    return q_Foo_component_1_DvU6FitWglY.w([
        _rawProps
    ]);
};
```

That `.w(...)` call is the runtime hook that wires `_captures` through to the lazy-loaded segment.

### Where capture data flows downstream

- **Phase 3 (migration)** — `computeSegmentUsage` augments `segmentUsage` with `extraction.captureNames` (`transform/index.ts:339–370`) so migration decisions know which module-level decls each segment actually needs.
- **Phase 4 (parent rewrite)** — emits the `.w([...])` capture array on each `q_<symbol>` reference. The emission lives in two passes: `rewriteCallSites` (`rewrite/index.ts:559`, appended at :585 inline with the QRL declaration) for declarations that already exist at the call site, and `addCaptureWrapping` (`rewrite/index.ts:718–755`) for the after-the-fact `.appendLeft` insertion on already-rewritten markers.
- **Phase 5 (segment codegen)** — `addCaptureAndMigrationImports` (`segment-codegen.ts:197`) emits the `_captures` import; `injectCapturesUnpacking` injects the unpacking line. The post-Phase-4 filtered `captureNames` is what gates these; in OSS-346's helper structure, `applyBodyTransforms` returns the filtered version explicitly.

---

## Deep dive: migration policy

When a module-level binding (`const X = ...`, `function fn() {}`, etc.) is referenced from a segment, the optimizer has to decide where the binding lives in the output: in the parent (re-exported so segments can import it), moved into a segment, or just left untouched. That decision is `decideMigration` in `src/optimizer/variable-migration.ts:477`.

### The three actions

| Action | Effect on parent | Effect on segment |
|---|---|---|
| `keep` | Declaration left untouched | No interaction |
| `move` | Declaration removed (its source range deleted) | Full declaration text inlined into the target segment, with import dependencies threaded |
| `reexport` | Original declaration kept; an `export { name as _auto_name }` line added | Segment emits `import { _auto_name as name } from "./parent"` |

The `_auto_` prefix is the convention for compiler-generated re-exports — distinguishes them from user `export` statements so the runtime can identify them.

### Decision rules

`decideMigration` evaluates rules in order at `variable-migration.ts:477–508`. First matching rule wins. After the main loop, the `promoteSharedDestructureGroups` post-pass (call at line 473, body at lines 525–554) refines specific shared-destructure cases.

| Rule | Predicate | Action | Reason code |
|---|---|---|---|
| MIG-03 | `isExported && usedByAnySegment` | `reexport` | `REEXPORT_EXPORTED` |
| (implicit) | `isExported && !usedByAnySegment` | `keep` | `KEEP_EXPORTED` |
| MIG-02 (dual) | `usedByRoot && usedByAnySegment` | `reexport` | `REEXPORT_DUAL_USE` |
| MIG-02 (multi) | `usingSegments.length > 1` | `reexport` | `REEXPORT_MULTI_SEGMENT` |
| MIG-04 | `hasSideEffects && usedByAnySegment` | `reexport` | `REEXPORT_SIDE_EFFECTS` |
| MIG-05 | `isPartOfSharedDestructuring && usedByAnySegment` | `reexport` | `REEXPORT_SHARED_DESTRUCTURE` |
| MIG-01 | `usingSegments.length === 1` | `move` | `MOVE_SINGLE_SEGMENT` |
| (implicit) | none match | `keep` | `KEEP_UNUSED` |

The intuition: re-export is the safe default whenever **anyone else** still needs the binding (root code, multiple segments, side-effect chain, sibling destructure binding). Move only fires when exactly one segment is the consumer.

### MIG-05a post-pass (added in OSS-338)

MIG-05's blanket re-export rule for shared destructures is correct in cases like `should_keep_non_migrated_binding_from_shared_destructuring_declarator` (some bindings go to root, others to one segment — must re-export so root's binding survives). But when **all bindings** of a shared destructure go to **exactly one segment**, with no root use, no export, no side effects, the entire destructure should `move`.

The `promoteSharedDestructureGroups` post-pass (`variable-migration.ts:525–554`) walks each shared-destructure group, validates the unanimous-target condition via `unifiedSingleSegmentTarget` (function at line 560), and rewrites the per-binding decisions in place from `reexport` → `move` (with reason `MOVE_SHARED_DESTRUCTURE_UNIFIED`).

This is still incomplete for nested-segment cases — the F4 convergence failure (`example_invalid_references`) is exactly this: parent passes, but segment-level migration fails because the post-pass doesn't yet handle nested-segment unification.

### The `usingSegmentsOf` helper (added in OSS-338)

`variable-migration.ts:443–449`:

```ts
function usingSegmentsOf(name, segmentUsage) {
  const result = [];
  for (const [segName, usedNames] of segmentUsage) {
    if (usedNames.has(name)) result.push(segName);
  }
  return result;
}
```

Used at lines 454 (basis for "is this a single-segment binding?"), 467 (multi-segment threshold), 476 (single-segment threshold), and 544 (post-pass sibling check). Centralising it made the rule predicates read as plain English instead of inline `for-loop` machinery, and gave the post-pass a shared primitive to validate against.

### Worked example — `example_segment_variable_migration`

Input (`match-these-snaps/qwik_core__test__example_segment_variable_migration.snap` lines 9–30):

```tsx
import { component$ } from '@qwik.dev/core';

const helperFn = (msg) => {
    console.log('Helper: ' + msg);
    return msg.toUpperCase();
};

const SHARED_CONFIG = { value: 42 };

export const publicHelper = () => console.log('public');

export const App = component$(() => {
    const result = helperFn('hello');
    return <div>{result} {SHARED_CONFIG.value}</div>;
});

export const Other = component$(() => {
    return <div>{SHARED_CONFIG.value}</div>;
});
```

Three module-level decls, three different decisions:

| Binding | Used by | Decision | Reason |
|---|---|---|---|
| `helperFn` | only App | **MOVE** to App segment | `MOVE_SINGLE_SEGMENT` |
| `SHARED_CONFIG` | App + Other | **REEXPORT** | `REEXPORT_MULTI_SEGMENT` |
| `publicHelper` | nobody (segments) | **KEEP** | `KEEP_EXPORTED` |

Output parent (snap lines 62–79):

```ts
//
const SHARED_CONFIG = { value: 42 };
export const publicHelper = ()=>console.log('public');
export const App = /*#__PURE__*/ componentQrl(q_App_component_ckEPmXZlub0);
export const Other = /*#__PURE__*/ componentQrl(q_Other_component_C1my3EIdP1k);
export { SHARED_CONFIG as _auto_SHARED_CONFIG };
```

`SHARED_CONFIG` got the `_auto_` re-export. `publicHelper` is unchanged. `helperFn` is gone.

Output App segment (snap lines 82–93):

```ts
import { _auto_SHARED_CONFIG as SHARED_CONFIG } from "./test";
//
const helperFn = (msg)=>{
    console.log('Helper: ' + msg);
    return msg.toUpperCase();
};
export const App_component_ckEPmXZlub0 = ()=>{
    const result = helperFn('hello');
    return <div>{result} {SHARED_CONFIG.value}</div>;
};
```

`helperFn` got moved here (lines 86–89). `SHARED_CONFIG` is imported via the `_auto_` alias.

Output Other segment (snap lines 32–38) imports `SHARED_CONFIG` the same way but doesn't get `helperFn` (it doesn't use it).

### Where decisions get applied

Two consumers of the `migrationDecisions` array:

- **Parent rewrite** (`rewrite/output-assembly.ts:655` — `assembleOutput`): for `reexport`, append the `export { x as _auto_x }` line; for `move`, delete the source range.
- **Segment codegen** (`transform/segment-generation.ts:621` — `wireMigration`): for `reexport`, add to the segment's `autoImports` (becomes `import { _auto_x as x }`); for `move` targeting **this segment**, inline the declaration text + its own import deps.

---

## Deep dive: JSX rewrite

The JSX transform converts `<div onClick={...} />` syntax into `_jsxSorted(...)` / `_jsxSplit(...)` helper calls that the Qwik runtime understands. Two entry points: full-module JSX during parent rewrite, and per-segment JSX in Phase 5 of `generateSegmentCode`.

> Both `_jsxSorted` and `_jsxSplit` are **tool-emitted** — they replace the author's `<div ... />` syntax. A developer never imports or calls them directly. Same for `_wrapProp` and `_fnSignal` below. See [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces).

### `_jsxSorted` vs `_jsxSplit`

Both helpers have the same calling shape — `(tag, varProps, constProps, children, flags, key)` — but they differ in how the runtime treats reactive coordination between var and const props.

The choice is made in `transform/jsx-elements-core.ts:510–513`:

```ts
const hasBindInConst = !tagIsHtml && constEntries.some(e => e.startsWith('"bind:'));
const jsxFn = hasBindInConst ? '_jsxSplit' : '_jsxSorted';
```

`_jsxSplit` fires when:
- The element has a **spread attribute** (handled separately via `buildJsxSplitCall`, lines 344–362).
- A **component element** (non-HTML) carries a `bind:` directive in its const props — two-way binding needs reactive plumbing between the two prop pools.

Otherwise: `_jsxSorted`, which is the common fast path.

### Var props vs const props

Each JSX attribute is classified as either `var` (could change between renders) or `const` (stable for the lifetime of the element). The classification logic lives in `classifyConstness` at `transform/jsx.ts:476–605`.

| const | var |
|---|---|
| Literals (string, number, boolean, null) | Identifiers not imported / not const-bound |
| `undefined`, imported names | `CallExpression` |
| Const-bound identifiers with static initializers | Any expression tree containing a var element |
| Object/array literals where every element is const | |
| Function expressions | |
| Template literals where every interpolation is const | |
| Identifiers initialized via `$()`, `Qrl()`, `use*()` (`isReturnStatic`, lines 56–69) | |

The output `_jsxSorted` call has the **var props as one bag and const props as another** so the runtime can skip re-computing the const bag on re-renders.

### Worked example — `destructure_args_colon_props`

Input (`match-these-snaps/qwik_core__test__destructure_args_colon_props.snap` lines 9–17):

```tsx
import { component$ } from "@qwik.dev/core";
export default component$((props) => {
    const { 'bind:value': bindValue } = props;
    return (
        <>
        {bindValue}
        </>
    );
});
```

Output segment (snap lines 30–38):

```jsx
import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";
import { _jsxSorted } from "@qwik.dev/core";
import { _wrapProp } from "@qwik.dev/core";
//
export const test_component_LUXeXe0DQrg = (props)=>{
    return /*#__PURE__*/ _jsxSorted(_Fragment, null, null, _wrapProp(props, "bind:value"), 1, "u6_0");
};
```

Reading the `_jsxSorted` arguments:

| Arg | Value | Meaning |
|---|---|---|
| 1 | `_Fragment` | Tag |
| 2 | `null` | Var props bag (none) |
| 3 | `null` | Const props bag (none) |
| 4 | `_wrapProp(props, "bind:value")` | Children (the `{bindValue}` interpolation, wrapped via `_wrapProp` for reactive prop access) |
| 5 | `1` | Flags (bitmask — element kind, has-children, etc.) |
| 6 | `"u6_0"` | JSX key (per-module-stable) |

### The JSX key counter

Every JSX element gets a key string of the form `"<prefix>_<count>"` (e.g., `"u6_0"`). The prefix is a hash of the module's relative path (`computeKeyPrefix(relPath)`); the counter is monotonic across the module.

Why threaded across phases: parent rewrite assigns keys to its own JSX, then segment codegen has to keep counting from where the parent left off so the same key never appears twice. The counter implementation is `JsxKeyCounter` at `transform/jsx.ts:618–638`, threaded as:

- `parentResult.jsxKeyCounterValue` from `transformAllJsx` (returned at jsx.ts:741) → into `transform/index.ts:623`.
- `parentJsxKeyCounterValue` → consumed by `segment-generation.ts:1132` and `transformSegmentJsx` (segment-codegen.ts:351–396) as `keyCounterStart`.
- Each segment's emit returns its updated `keyCounterValue` (`segment-generation.ts:1110` and folded back at :1155–1156) — folded back so the next segment continues counting.

### `_fnSignal` — reactive expression hoisting

When a JSX expression depends on a signal or store and is non-trivial (`store.address.city.name`, computed array literals), the optimizer hoists it into a top-level `_hf<n>` arrow + serialised string and replaces the inline expression with a `_fnSignal(_hf<n>, [deps], _hf<n>_str)` call. Logic in `signal-analysis.ts:385` (`generateFnSignal`); fires for object/array literals with reactive values, complex `.value` access on signals, deep store access.

Example shape (from a `_fnSignal`-heavy snapshot):

```js
const _hf0 = (p0) => ["container", `count-${p0.count}`];
const _hf0_str = "[\"container\",`count-${p0.count}`]";
// in JSX:
class: _fnSignal(_hf0, [store], _hf0_str)
```

The string form is what the runtime serialises across the network; the function form is what executes locally on update.

---

## Deep dive: segment metadata

The metadata block emitted next to each segment file (the `/* { ... } */` comments in `match-these-snaps/`) is what `convergence.test.ts` compares against. Each field has a specific purpose in extraction, codegen, or runtime resolution — knowing which is which makes it much easier to reason about why a convergence test fails.

### Field reference

All fields live on `ExtractionBase` and the phase-tagged variants `ExtractedSegment` / `CapturedSegment` / `ConsolidatedSegment` (split into a discriminated union per OSS-389; see `extract.ts:63–186`). They originate during Phase 1 extraction and travel through every downstream phase.

The `Computed at` column points at the marker-call extraction block (`extract.ts:863–1022`), where every initial-extraction field is set on the builder; helpers it calls live in `marker-detection.ts` (`getExtractionKind`, `getExtractionName`) and `naming.ts` / `siphash.ts` (symbol/hash composition).

| Field | Type | Computed at | Used for |
|---|---|---|---|
| `origin` | `Origin` | `extract.ts:1003` | Source file path; preserved verbatim through pipeline |
| `name` | `SymbolName` | `extract.ts:978` (default path — `ctx.naming.getSymbolName()`) or `:975` (OSS-437 import-derived override — `mkSymbolName(importContextPortion + "_" + hash)`); assigned to the builder at `:985` | Canonical symbol name for the segment's exported binding (see [Symbol naming and hashing](#symbol-naming-and-hashing)) |
| `displayName` | `DisplayName` | `extract.ts:977` (default — `ctx.naming.getDisplayName()`) or `:973` (OSS-437 override — `mkDisplayName(fileStem + "_" + importContextPortion)`); assigned at `:986` | Human-readable name without hash; appears in dev tooling |
| `hash` | `Hash` | `extract.ts:980` (default — extracted from symbol name) or `:974` (OSS-437 override — `qwikHashFromSeed(importHashSeed)`); assigned at `:987` | 11-char content-addressed suffix; stable across builds |
| `canonicalFilename` | `CanonicalFilename` | `extract.ts:988` | `displayName + "_" + hash`; basis for the segment file path |
| `entry` | `string \| null` | `entry-strategy.ts:19–48` (Phase 5) | Routing field — non-null for `single` / `component` entry strategies |
| `parent` | `SymbolName \| null` | initially null at extract; resolved in `rewrite/index.ts:452` (`resolveNesting`) | Symbol name of enclosing extraction (for nested segments) |
| `ctxKind` | `'function' \| 'eventHandler' \| 'jSXProp'` | `extract.ts:955` (`getExtractionKind`); assigned at `:1001` | Drives downstream branching (e.g., event handlers get JSX-prop emit shape) |
| `ctxName` | `CtxName` | `extract.ts:957` (`getExtractionName`); assigned at `:1002` | The `$`-marker name (`component$`, `useTask$`, etc.); drives strip rules and HMR injection |
| `loc` | `readonly [ByteOffset, ByteOffset]` | `extract.ts:1010` | Source byte range; used for source map mapping and migration source-range surgery |
| `captures` | `boolean` | `capture-analysis.ts:51` | Quick boolean — does this segment close over outer scope? |
| `captureNames` | `readonly SymbolName[]` | `capture-analysis.ts:26–27` | Actual list of captured names; mutated through Phase 4–5 (props consolidation, const inline, migration filter) |
| `paramNames` | `readonly string[]` | `capture-analysis.ts:40` | Closure parameter names; threaded to `rewriteFunctionSignature` for loop-padding (`_,_1,...`) cases |

### Symbol naming and hashing

Four metadata fields encode different views of the same composed name: `displayName`, `hash`, `symbolName` (a.k.a. `name`), and `canonicalFilename`. They're all derived from a single AST walk that maintains a context stack as it descends into nested marker calls. Understanding the composition is the difference between "this name is a magic string" and "this name is a deterministic function of three things you can read off the source."

#### The four-step pipeline

**1. Walk the AST, push to a context stack** — `ContextStack` (`src/optimizer/context-stack.ts:49`). Pushed during traversal:

- Variable declarators (`renderHeader1`, `Foo`)
- Function and class declarations
- Object literal property keys
- JSX element tag names (`div`, `Fragment`)
- JSX attribute names with the trailing `$` stripped (`onClick$` → `onClick`)
- Marker callee names with the trailing `$` stripped (`useTask$` → `useTask`); for the bare `$()`, the *wrapper context* is pushed instead via `getDirectWrapperContextName` (e.g. inside `useTaskQrl(...)` the stack picks up `useTask`)
- `pushDefaultExport()` — for default exports without a binding name, uses the file stem with bracket-route handling: `[id].tsx` → `id`, `[[...slug]].tsx` → `slug`

The walker pushes when entering relevant nodes and pops when leaving them; the stack at the moment of marker detection is the segment's naming context.

**2. Build the displayName** — `buildDisplayName` (`src/hashing/naming.ts:66`):

- Joins context stack with `_`; empty stack falls back to literal `s_`
- Runs through `escapeSymbol` (`naming.ts:26`) — strips non-alphanumeric chars, collapses runs to a single `_`, drops leading/trailing `_`
- If the result starts with a digit, prepends `_` so the name is a valid identifier
- Prepends `<fileStem>_` (the source filename including extension, e.g. `test.tsx_`)
- **Result**: `test.tsx_renderHeader1_div_onClick`

**3. Compute the hash** — `qwikHash` (`src/hashing/siphash.ts:22`):

- SipHash-1-3 with all-zero keys (`[0, 0, 0, 0]`)
- Input: `(scope ?? '') + relPath + contextPortion` concatenated with no separators (`contextPortion` is the displayName minus the `<fileStem>_` prefix)
- Encoded as 11-char base64url, with `+`/`/` mapped to `-`/`_` then `-`/`_` replaced by `0` for filesystem safety
- **Result**: `jMxQsjbyDss`

**4. Compose the final names** — `buildSymbolName` (`src/hashing/naming.ts:96`):

- `symbolName` = `<contextPortion>_<hash>` → `renderHeader1_jMxQsjbyDss`
- `canonicalFilename` = `<displayName>_<hash>` → `test.tsx_renderHeader1_jMxQsjbyDss` (basis for the segment file path on disk)
- The `name` field on `ExtractionResult` aliases `symbolName`

#### Import-derived override (OSS-437)

When a marker call's first argument is a single `Identifier` resolving to an import binding, the four-step pipeline above is **bypassed**. The displayName + hash derive from the import path instead of the surrounding context stack. Mirrors SWC's `get_import_qrl_name` + `register_context_name` `hash_override` path (swc-reference-only/transform.rs:443-478 + 372-440).

For `useStyles$(css3)` with `import css3 from './style.css'`:

- `resolvedSource` = `resolveImportHashPath('./style.css', relPath)` — normalises `./` and `..` against the current file's directory (`extract.ts:344-371`). For `relPath = "test.tsx"` (no directory) the resolved form is just `style.css`.
- `pathTail` = `resolvedSource.split('/').last()` = `style.css`
- `baseName` = `escapeSymbol(pathTail)` = `style_css`
- `importContextPortion` = `baseName` if `importedName === 'default'`, else `<baseName>_<escapeSymbol(importedName)>`
- `displayName` = `<fileStem>_<importContextPortion>` = `test.tsx_style_css`
- `hash` = `qwikHashFromSeed(<resolvedSource>#<importedName>)` = SipHash of `style.css#default` (NOT the usual `scope + relPath + displayName` concat — direct seed bytes)
- `symbolName` = `<importContextPortion>_<hash>` = `style_css_TRu1FaIoUM0`

This keeps the segment hash stable across files importing the same asset under the same name — `useStyles$(css3)` in any file referencing `./style.css` produces the same hash, even though the surrounding context stack differs. Currently fires for the single-Identifier-import case only; SWC's second arm (namespace-member-import: `useStyles$(ns.foo)`) is unimplemented in TS — file when a fixture exercises it. Helper: `getImportArgNaming` (`extract.ts:325–342`).

`disambiguateExtractions` (below) still runs but the override-hash invariant isn't preserved on collision — collisions recompute via the default `qwikHash(scope, relPath, newContext)` formula, diverging from SWC. The current fixture set has no collisions on the override path; defensively fix when a fixture exercises it.

#### Disambiguation

When two extractions in one file would collide on `displayName` (e.g., a `$()` nested inside a `component$` whose stack already ends at `Foo_component`), `disambiguateExtractions` (`extract.ts:1155–1196`) appends `_1`, `_2`, ... to the second-onwards occurrences and **recomputes the hash** for each renamed entry. This is why `example_multi_capture` shows both `Foo_component_HTDRsvUbLiE` (the outer) and `Foo_component_1_DvU6FitWglY` (the nested one) — the inner `$()` originally shared context with its parent, so it got the `_1` suffix and a fresh hash with `_1` folded into the input. **`inlinedQrl` extractions skip disambiguation** (per OSS-408): peer-tool-supplied names already encode uniqueness via their hash suffix, and appending `_<n>` would rewrite a name the upstream consumer expects.

#### Production rename

In `prod` mode, `transform/index.ts:451–468` rewrites every segment's `symbolName` from `<contextPortion>_<hash>` to a short `s_<hash>` to reduce shipped bytes. Applies to `inlinedQrl` extractions too — SWC also renames them under prod, preserving the hash suffix so runtime QRL resolution (hash-keyed) still matches. The original symbolName is preserved in `preRenameSymbolName` for migration-decision keying. The rename is also mirrored in `closureNodes` so post-rename lookups (Phase 4 const-literal resolution, etc.) still find the threaded AST node. `displayName`, `hash`, and `canonicalFilename` are unchanged — the rename is symbolName-only, and runtime resolution still works because the hash is the lookup key.

For `inlinedQrl` whose peer-tool-supplied name has no recognisable hash suffix (the post-`_` portion isn't 8+ alphanumeric — see `extract.ts:625–640`), the full name is used as the hash; prod-rename then produces `s_<fullName>`. Conservative — better to keep more of the name than to fabricate a hash from a name that doesn't follow the convention.

#### Worked examples — `example_1`

| Source | Stack at extraction | displayName | hash | symbolName |
|---|---|---|---|---|
| `export const renderHeader1 = $(() => ...)` | `[renderHeader1]` | `test.tsx_renderHeader1` | `jMxQsjbyDss` | `renderHeader1_jMxQsjbyDss` |
| `<div onClick={$((ctx) => ...)}/>` | `[renderHeader1, div, onClick]` | `test.tsx_renderHeader1_div_onClick` | `USi8k1jUb40` | `renderHeader1_div_onClick_USi8k1jUb40` |

And from `example_multi_capture` (showing disambiguation):

| Source | Stack at extraction | displayName | symbolName |
|---|---|---|---|
| `export const Foo = component$(({foo}) => ...)` | `[Foo, component]` | `test.tsx_Foo_component` | `Foo_component_HTDRsvUbLiE` |
| `return $(() => ...)` (nested inside that component$) | `[Foo, component]` (collides → renamed) | `test.tsx_Foo_component_1` | `Foo_component_1_DvU6FitWglY` |

#### Why this design

- **Filesystem-safe** — `escapeSymbol` strips everything except alphanumeric and underscore; the hash's `-`/`_` get rewritten to `0`. The canonicalFilename can land on disk with no escaping.
- **Deterministic across builds** — same source + same `relPath` produces the same `(displayName, hash, symbolName)`. The QRL refs in a parent module always match the segment filenames the runtime will fetch.
- **Encodes call-site context** — readers can recover roughly *what kind of thing* a segment was from its name alone (`renderHeader1_div_onClick` is clearly a click handler nested inside `renderHeader1`'s render).
- **Hash is a tiebreaker, not the identity** — the contextual prefix is the human-readable part; the hash exists only to disambiguate identical contexts across files and force any source change to produce a fresh name.

### `entry` field resolution

Resolved at `entry-strategy.ts:19–48` during Phase 5 (segment generation), once per segment:

| Strategy | Result |
|---|---|
| `smart`, `segment`, `hook`, `inline`, `hoist` | `null` (each segment is its own entry) |
| `component` | `null` for component segments; parent's symbol name for non-component children |
| `single` | Fixed string `"entry_hooks"` |
| `manual` | Looked up from a user-provided `manual: Record<symbolName, entry>` map |

For `example_1` and most convergence tests, the strategy is `smart` so all `entry` fields are `null`.

### `captures` vs `captureNames`

Both are populated by capture analysis, but they diverge through the pipeline:

- `captures: boolean` is computed once during analysis as `captureNames.length > 0` (`capture-analysis.ts:51`).
- `captureNames: string[]` is **mutated** through later phases:
  - `consolidateRawPropsCaptures` (`segment-generation.ts:290`, called from inline-strategy at :419 and default-strategy at :964) and `preConsolidateRawPropsCaptures` (`rewrite/index.ts:394–428`) — props field consolidation can replace destructured prop names with `_rawProps`.
  - `segment-generation.ts:974` — const-literal inlining drops names whose values get folded.
  - `segment-generation.ts:757–773` — migration filtering drops names that became `_auto_` imports.

So they can diverge: `captures: true` might persist while `captureNames` shrinks. They snap back into sync only when `captureNames` becomes empty.

### Convergence test validation

`tests/optimizer/convergence.test.ts:120–158`. Strict equality on:

```ts
actual.origin !== expected.origin ||
actual.name !== expected.name ||
actual.displayName !== expected.displayName ||
actual.hash !== expected.hash ||
actual.canonicalFilename !== expected.canonicalFilename ||
actual.ctxKind !== expected.ctxKind ||
actual.ctxName !== expected.ctxName ||
actual.captures !== expected.captures
```

`parent`, `loc`, `paramNames`, and `captureNames` appear in the snapshot for inspection but **are not strict-compared** in this assertion. (They're still useful when debugging — a `captureNames` mismatch in the snap usually points at a real bug even if the test doesn't fail directly on it.)

### Where the metadata is emitted

The per-segment `SegmentMetadataInternal` block is constructed at two sites — `segment-generation.ts:436` (inside `buildInlineStrategySegment`) and `:1083` (inside `buildDefaultStrategySegment`) — both producing the same shape from these fields. That object lands in the `TransformModule.segment` field for non-stripped segments. The runtime uses `name` + `canonicalFilename` to resolve the lazy import; everything else is for tooling and tests. The duplicate-construction shape dates to the OSS-356/357/358 split — both strategy paths assemble the metadata block; only the upstream segment-code generation diverges.

---

## Quick reference — code map

| Concern | File |
|---|---|
| Top-level orchestrator | `src/optimizer/transform/index.ts:93` (`transformModule`) |
| Find `$()` calls + initial metadata | `src/optimizer/extract.ts` |
| Symbol naming + hash computation | `src/optimizer/context-stack.ts`, `src/hashing/naming.ts`, `src/hashing/siphash.ts` |
| Capture analysis | `src/optimizer/capture-analysis.ts` |
| Migration decisions | `src/optimizer/variable-migration.ts` |
| Parent rewrite | `src/optimizer/rewrite/index.ts`, `rewrite/output-assembly.ts` |
| Per-segment codegen orchestrator | `src/optimizer/segment-codegen.ts:595` (`generateSegmentCode`) |
| Per-segment body transforms | `src/optimizer/segment-codegen/body-transforms.ts` |
| Per-segment import collection | `src/optimizer/segment-codegen/import-collection.ts` |
| All-segments orchestrator | `src/optimizer/transform/segment-generation.ts:1127` (`generateAllSegmentModules`) — 34-line sequencer |
| All-segments setup (Prep) | `src/optimizer/transform/segment-generation.ts:321` (`computeSegmentGenerationPrep`) |
| Inline-strategy segment builder | `src/optimizer/transform/segment-generation.ts:409` (`buildInlineStrategySegment`) |
| Default-strategy segment builder | `src/optimizer/transform/segment-generation.ts:921` (`buildDefaultStrategySegment`) |
| Migration wiring (top-level + nested) | `src/optimizer/transform/segment-generation.ts:621` (`wireMigration`) |
| Nested call-site builder | `src/optimizer/transform/segment-generation.ts:784` (`buildNestedCallSites`) |
| Nested QRL declarations | `src/optimizer/transform/segment-generation.ts:477` (`buildNestedQrlDeclarations`) |
| Raw-props consolidation (shared) | `src/optimizer/transform/segment-generation.ts:290` (`consolidateRawPropsCaptures`) |
| Post-process per segment | `src/optimizer/transform/post-process.ts:158` (`postProcessSegmentCode`) |
| Shared extraction predicates | `src/optimizer/rewrite/predicates.ts` |
| Stripped-segment codegen | `src/optimizer/strip-ctx.ts` |
| Entry strategy resolution | `src/optimizer/entry-strategy.ts` |
| JSX core transform | `src/optimizer/transform/jsx.ts`, `transform/jsx-elements-core.ts` |
| Reactive expression hoisting (`_fnSignal`) | `src/optimizer/signal-analysis.ts` |
| Module-level cleanups (DCE, unused imports) | `src/optimizer/transform/module-cleanup.ts`, `transform/dead-code.ts` |
| Convergence test harness | `tests/optimizer/convergence.test.ts` |
| Failure-families test (broader, less strict) | `tests/optimizer/failure-families.test.ts` |

---

## Maintenance

OPTIMIZER.md captures the pipeline's **stable structural shape** — phases, conventions, the author/tool boundary, and the worked-example cross-references. It does not track in-flight work; that's STATE.md's job.

### How this differs from STATE.md

| | STATE.md | OPTIMIZER.md |
|---|---|---|
| **Scope** | Branch-scoped — refreshed per workstream | Project-wide stable rule, alongside METHODOLOGIES / LINEAR / CONSTRAINTS |
| **Edit cadence** | Aggressively, on every meaningful test flip / branch / ticket transition | Only when something **structural** changes (see below) |
| **Where edits happen** | On feature branches; never on `main` directly | On any branch where a structural change lands; folded into the same PR as the code |
| **Trim policy** | Trim "Most recent meaningful progress" past ~10 entries | No trim — sections grow only when conventions grow |

The intuition: STATE.md is a working artifact you update aggressively; OPTIMIZER.md is a contract you update deliberately.

### When to update

Update when something **structural** changes:

- A phase marker in `transformModule` is added, removed, renumbered, or substantially restructured.
- A new author-surface marker is added to Qwik core (a new `$`-suffixed function the optimizer needs to recognise).
- A new tool-surface convention name is introduced (e.g. a new `_<helper>` import) or an existing one is renamed.
- A migration rule (MIG-XX) is added, removed, or its predicate fundamentally changes.
- A new entry strategy is added or an existing one's emit shape changes materially.
- An `ExtractionResult` metadata field is added, removed, or repurposed.
- A core helper module is restructured enough that the file:line refs in this doc would mislead a reader (rule of thumb: >50 lines of drift, or the section moved to a different file).
- A worked-example snapshot is materially changed or removed (the doc cites four: `example_1`, `example_multi_capture`, `example_segment_variable_migration`, `destructure_args_colon_props`). If any goes red on convergence, swap it for a still-passing equivalent.

### Don't update for

- Bug fixes that preserve the documented contract (e.g. correcting MIG-05a's nested-segment edge case doesn't require a doc update if the rule's intent is documented correctly — only its implementation moved).
- File:line drift below ~30 lines — the section is still findable from surrounding text.
- Per-test convergence flips.
- Mid-investigation findings — those belong in commit messages and Linear comments.
- Speculation about future phases, refactors, or planned conventions.

### Trigger checklist for pipeline refactors

When a refactor touches one of these modules, **audit OPTIMIZER.md before merging the PR**:

- `src/optimizer/transform/index.ts` (the orchestrator)
- `src/optimizer/extract.ts`
- `src/optimizer/capture-analysis.ts`
- `src/optimizer/variable-migration.ts`
- `src/optimizer/segment-codegen.ts`
- `src/optimizer/segment-codegen/body-transforms.ts`
- `src/optimizer/segment-codegen/import-collection.ts`
- `src/optimizer/transform/segment-generation.ts`
- `src/optimizer/transform/post-process.ts`
- `src/optimizer/rewrite/predicates.ts`
- `src/optimizer/rewrite/index.ts`, `rewrite/output-assembly.ts`
- `src/optimizer/transform/jsx.ts`, `transform/jsx-elements-core.ts`
- `src/optimizer/signal-analysis.ts`
- `src/optimizer/entry-strategy.ts`
- `src/optimizer/strip-ctx.ts`
- `src/optimizer/context-stack.ts`
- `src/hashing/naming.ts`, `src/hashing/siphash.ts`

For each touched file, ask:

1. **Do file:line refs cited in OPTIMIZER.md still resolve?** Quick check: `grep -n "<filename>" .claude/rules/OPTIMIZER.md` then sanity-check each line number.
2. **Does this rename or add a tool-surface convention?** If yes, the "Two namespaces" reference table needs updating.
3. **Does this change phase shape, sequencer ordering, or the public contract of a deep-dive's subject?** If yes, that section needs a pass.
4. **Does the worked example I'm citing still demonstrate what the doc says it demonstrates?** Re-read the snap and the prose side-by-side.

If any answer is yes, fold the doc update into the same PR as the code change.

### Each update

1. Verify the worked-example snapshots still pass convergence (`pnpm vitest convergence --run`).
2. Spot-check 3–5 file:line refs that the change might have invalidated.
3. Read the affected section top-to-bottom in the new state — does the trace still match what the code does?
4. Land the doc update in the **same PR** as the code change. Doc-only catch-up PRs are fine when drift is discovered later, but inline updates are the default.

### When in doubt

If you're not sure whether a change is "structural enough" to warrant a doc update, the safer default is to update. Stale conventions in OPTIMIZER.md mislead future readers in ways that are hard to detect — there's no test that fails when the doc and code disagree. Erring on the side of clarity costs little; erring on the side of silence accrues debt.
