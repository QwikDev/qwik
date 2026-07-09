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
| `_inlined_<name>` | Hoisted body of a capture-position `inlinedQrl` (a QRL used as a value inside another QRL's captures array, so not a lazy boundary). The inline `inlinedQrl(<fn>, "name", …)` function is lifted to a top-level `const _inlined_name = <fn>` and the call references it | Phase 5 segment codegen (`segment/hoist-inlined-qrl.ts`) |
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

The JSX-attribute rule has a **pre-transformed twin**: when a bundler (esbuild/oxc) transpiles `.tsx` to `_jsxDEV("button", { onClick$: () => … })` *before* the optimizer runs, the `$`-suffixed handler arrives as a JSX-factory call's object property, not a `<tag onClick$={…}>` attribute. Phase 1 extracts those identically (the `Property` branch in `extract.ts`, gated on the parent `ObjectExpression` being a tagged `jsxPropObjects` bag — see `extract.ts:1320`), flagging the extraction `isJsxObjectProp: true`. The flag routes the call-site rewrite to the *bare-value* path (replace the property value with the `q_<symbol>` ref → `onClick$: q_X`) instead of the JSX-attribute path (`q-e:click={q_X}`), in both the segment-codegen rewriter (`buildNestedCallSites`) and the inline/hoist rewriter (`rewrite/inline-body.ts`). Without this split, an event handler in pre-transformed JSX is never lazy-loaded and the module-level bindings it references get mis-attributed and dropped — the convergence snapshot suite never exercises this shape because every fixture input is raw JSX.

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
| `$(fn)` | The bare base marker — no naming context. Symbol name derives from the call-site / JSX surroundings via `getDirectWrapperContextName` (`extract.ts:426`) |
| `sync$(fn)` | Recognised but **does not extract** (`marker-detection.ts:222`, `isSyncMarker`). Body stays inline as a literal callback for QRL APIs that need a function reference rather than a lazy ref |
| `implicit$FirstArg(fn, ...)` | Meta-marker; lets a non-`$`-suffixed function be treated as if its first argument were `$()`-marked. Backbone of `qwik-react`'s `qwikify$`. Resolved via `customInlined` map in `extract.ts:337` (`resolveCanonicalCalleeName`) |

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

Top-level entry is `transformModule` at `src/optimizer/transform/index.ts:226` — a thin multi-file loop that hands each input to the per-file driver `transformOneModule` (`transform/index.ts:258`), which sequences one named helper per phase. Each helper takes explicit inputs and returns an explicit typed result object (`PreparedModuleInput`, `CaptureAnalysis`, `MigrationAnalysis`, …) so the data flow between phases is visible at the signature level (refactored per OSS-478 from a single ~650-line loop body).

| Phase | Helper | What it does | Key code |
|---|---|---|---|
| 0 + 0.5 | `prepareModuleInput` (`transform/index.ts:336`) | Repair SWC-recoverable parse errors; flatten `const {x} = useFoo()` destructures; detect foreign JSX pragma; parse once | `repairInput`, `flattenAndReparse` |
| 1 | `extractModuleSegments` (`transform/index.ts:395`) | **The fused per-module walk** (per OSS-496): one program traversal — the canonical gather walk hosting the Phase-1 extraction collector — finds every `$(...)` call (loc + body text + initial metadata) AND gathers every per-module fact Phase 2 consumes. Two passthrough early-exits: a sound marker prefilter (`sourceMayContainMarkers` — no `$`-final token, no `inlinedQrl`, no unicode-escaped `$`) skips the walk entirely on marker-less non-JSX modules; otherwise zero extractions + no JSX to transpile exits after the walk | `gatherModuleFacts` in `analysis/module-gather-walk.ts` hosting `createExtractionCollector` in `extract.ts` (standalone `extractSegments` retained as differential oracle) |
| 2 | `analyzeModuleCaptures` (`transform/index.ts:525`) | Collect imports + run scope analysis on each closure to determine which outer-scope vars are captured. Closure AST nodes are threaded through from Phase 1 (`closureNodes` map populated by the extraction collector per OSS-353). All per-module program facts (free identifiers, lexical scope chains, loop maps, scope entries, segment usage, passive conflicts, JSX scope bindings) arrive pre-built from the Phase-1 fused walk — a single traversal that also builds the `ScopeTracker` as it goes (per OSS-495) and hosts extraction itself (per OSS-496); Phase 2 runs no program walk of its own | `analyzeCaptures`, `collectScopeIdentifiers` |
| 3 | `attributeSegmentUsage` (`transform/index.ts:742`) | For each module-level binding referenced inside a segment, decide: stay in parent (`keep`), move into segment (`move`), or re-export (`reexport`). The usage maps arrive pre-built from the Phase-1 fused walk; this phase only augments and decides | `decideMigration` in `variable-migration.ts` |
| 4 | `rewriteParent` (`transform/index.ts:923`) | Rewrite the parent module — replace each `$(closure)` with a generated `q_<symbol>` `qrl(...)` reference; apply migration decisions | `rewriteParentModule` in `rewrite/index.ts` |
| 5 | `generateSegments` (`transform/index.ts:1051`) | Emit one module per non-stripped segment | `generateAllSegmentModules` in `segment/segment-generation.ts` (34-line sequencer over named helpers per OSS-356/357/358 — see SPEC at `.planning/specs/segment-generation-refactor.md`) |
| 6 | `applyDiagnosticSuppression` (`transform/index.ts:1167`) | Apply diagnostic suppression directives (cross-file; runs once in `transformModule`) | (lightweight cleanup) |

Between Phases 3 and 4 the driver runs two small steps: `applyProdRename` (`transform/index.ts:854`, the prod `s_<hash>` rename) and `downgradeExtensions` (`transform/index.ts:890`, transpile-target extension downgrade).

The all-segments orchestrator `generateAllSegmentModules` (`segment-generation.ts:1327`) is a 34-line sequencer over six named helpers: `computeSegmentGenerationPrep` (per-call setup), `buildInlineStrategySegment` (inline/hoist branch), `buildDefaultStrategySegment` (default branch sequencer), and three sub-helpers `buildNestedQrlDeclarations` / `wireMigration` / `buildNestedCallSites` plus a shared `consolidateRawPropsCaptures`. Refactor track v2 (OSS-356/357/358) extracted these from a 580-line monolith; full design rationale at [`.planning/specs/segment-generation-refactor.md`](../../.planning/specs/segment-generation-refactor.md).

Phase 5's per-segment work flows through `generateSegmentCode` (`segment/segment-codegen.ts:650` — refactored in OSS-346 into a 9-phase sequencer with extracted helpers `collectInitialImports` and `applyBodyTransforms`) followed by `postProcessSegmentCode` (`segment/post-process.ts:158`).

---

## Tracing `example_1` through the phases

### Phase 1 — extraction (`src/optimizer/extraction/extract.ts`)

Walks the AST looking for `$(...)` calls — since OSS-496 the per-node handlers live in `createExtractionCollector` and run inside the canonical gather walk's single traversal (the standalone `extractSegments` walk survives as the differential oracle). For `example_1` it finds 3:

| symbolName (initial) | bodyText (closure source) | parent | location |
|---|---|---|---|
| `renderHeader1_jMxQsjbyDss` | `() => { return <div onClick={...}/>; }` | `null` | line 11 of input |
| `renderHeader1_div_onClick_USi8k1jUb40` | `(ctx) => console.log(ctx)` | `renderHeader1_jMxQsjbyDss` | line 13 |
| `renderHeader2_component_Ay6ibkfFYsw` | `() => { console.log("mount"); return render; }` | `null` | line 16 |

Each row's `symbolName` is composed in four steps from a context-stack walk during AST traversal: build a `displayName` from the stack, hash it with SipHash-1-3, append the hash. Full mechanics (including disambiguation when contexts collide and the prod-mode `s_<hash>` rename) live in [Symbol naming and hashing](#symbol-naming-and-hashing) under the metadata deep dive.

### Phase 2 — capture analysis (`analyzeModuleCaptures`, `transform/index.ts:525`)

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

### Phase 5 — segment generation (`segment-generation.ts:generateAllSegmentModules` → `segment/segment-codegen.ts:generateSegmentCode`)

For each segment, `generateSegmentCode` runs the 9-phase sequencer at `segment/segment-codegen.ts:650`. Walking through the renderHeader1 segment:

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

### Phase 6 — post-process per segment (`segment/post-process.ts:postProcessSegmentCode`)

Each emitted segment string then goes through `postProcessSegmentCode` (called from `segment/segment-generation.ts:1257` inside `buildDefaultStrategySegment`):

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

Three functions across two modules:

- **`gatherModuleFacts`** (`analysis/module-gather-walk.ts`) — the canonical per-module gather walk, and since OSS-496 **the host of Phase-1 extraction itself**: in production it runs once per module from `extractModuleSegments`, in fused-extraction mode (`extraction` input), driving the extraction collector's enter/leave handlers alongside its projections. One walk over the whole program — building the `ScopeTracker` scope tree as it traverses while carrying the open-closure, lexical-scope, and loop stacks (the tracker is frozen post-walk, then buffered free identifiers resolve via `ScopeQueryTracker.getDeclarationFromScope`, per OSS-494/495) — produces the extraction set plus every per-module fact at once: the free-identifier map (for **every** extraction closure — the identifiers referenced inside it that don't resolve within its own subtree, keyed by closure node identity, stable across the prod `s_<hash>` rename), lexical scope chains (also keyed by closure-node identity), the extraction loop map, scope entries, segment/root usage, passive-conflict sites, and (for JSX modules) the scope-aware bindings the Phase-4 JSX transform consumes via `precomputedScopeBindings` (per OSS-488). Mid-walk recording keys by node/object identity only — closures register for the free-identifier and lexical-scope projections at their creation node's enter (always before the walker descends into the closure), and loop stacks snapshot at the extraction's own creation node; the symbolName-keyed maps (`extractionLoopMap`, `segmentUsage`) are derived post-walk, after `disambiguateExtractions` finalises names. Segment-usage classification and scope-entry building are skipped when a fused walk finds zero extractions (their consumers iterate extractions). The free-identifier projection replaced the per-closure `getUndeclaredIdentifiersInFunction` calls (two walks *per closure per consumer*, OSS-486 group 1); the remaining per-fact walks folded in as projections (group 3); the standalone extraction walk folded in per OSS-496, with a sound marker prefilter (`sourceMayContainMarkers` in `marker-detection.ts`) letting marker-less non-JSX modules skip the walk entirely. The map also feeds event-handler capture promotion (`EventCaptureContext.closureFreeIdentifiers`) and C02 diagnostics; `computeClosureFreeIdentifiers` (`analysis/closure-free-identifiers.ts`) survives as a single-projection wrapper. The replaced standalone walk functions — including `extractSegments`, which still drives the shared collector with its own walk — are retained as differential oracles, pinned by per-projection corpus parity tests (`module-gather-walk.test.ts`, `fused-extraction-parity.test.ts`).
- **`collectScopeIdentifiers`** (`capture-analysis.ts:81`) — recursively walks a container (Program, BlockStatement, FunctionBody, Function). Returns a `Set<string>` of every name that's declared inside it: var/const/let bindings (including destructure patterns), function and class names, function parameters.
- **`analyzeCaptures`** (`capture-analysis.ts:42`) — for one closure: takes its slice of the free-identifier map, intersects with the parent scope's identifiers (so we keep only outer-scope refs, not globals or imports). Returns sorted, deduplicated `string[]`; function/class declaration names are filtered by the caller.

The orchestration lives in `analyzeModuleCaptures` (`transform/index.ts:525`). It receives the free-identifier map from the Phase-1 fused walk, then for each extraction:

1. Looks up the closure AST node from the `closureNodes` map populated by the Phase-1 extraction collector (OSS-353 — replaced an earlier per-extraction body re-parse with a single canonical AST walk; the closure node carries its own source-absolute positions so diagnostics align with the original file).
2. Picks the right parent scope: if the closure is nested inside another extraction, the parent is the outer extraction's body scope; otherwise it's the module scope.
3. Calls `analyzeCaptures` to populate `extraction.captureNames`.
4. Sets `extraction.captures = captureNames.length > 0`.

### Two populating paths: `$()` (developer) vs `inlinedQrl` (tool)

There are **two completely separate code paths** for populating `captureNames`, and which one runs depends entirely on whether a developer or a tool wrote the source:

**Path A: regular `$()` — author-written, optimizer infers everything.**
- `transform/index.ts:577` (the per-extraction loop in `analyzeModuleCaptures`) calls `analyzeCaptures` to walk the closure scope.
- The captures list is **derived** from what variables the closure references.
- The body does not yet contain `_captures[i]` references; the optimizer injects the unpacking line during Phase 5.

**Path B: `inlinedQrl(fn, "name", [captures])` — tool-written, optimizer trusts the spec.**
- `transform/index.ts:587` (the `isInlinedQrl` branch of the same loop) parses the explicit `[captures]` array directly from the source.
- The captures list is **declared**, not derived. The optimizer doesn't re-analyse — it trusts the upstream tool got it right.
- The body **already contains** `const x = _captures[0]` lines (the upstream tool wrote them). Phase 5 sets `skipCaptureInjection: true` and doesn't inject a duplicate unpacking.
- `inlinedQrl`'s captures array can contain non-identifier expressions — `[left, true, right]` is valid (see `should_preserve_non_ident_explicit_captures.snap`). Regular `$()` can't express this; only the explicit form can.
- `inlinedQrl` segments are **never stripped**, regardless of `stripCtxName` / `stripEventHandlers`. The per-extraction strip gate (`isStrippedExtraction` in `rewrite/predicates.ts`) short-circuits to `false` for any `isInlinedQrl` extraction before consulting the ctxName/ctxKind predicate — mirroring SWC, whose strip check (`should_emit_segment`) runs only in the developer-`$()` path (`_create_synthetic_qsegment`), never the inlinedQrl path (`create_synthetic_qqsegment`). Stripping a pre-baked QRL whose name happens to match a strip prefix (e.g. the router lib's `serverQrl` dispatcher vs `stripCtxName: ['server']`) would collapse it to a chunkless `_noopQrl` and break `server$` RPC at runtime (Qwik Q14, "does not have a chunk path").

**Where you'll actually encounter `inlinedQrl`:**

1. **Interop library codegen.** `qwik-react` and similar frameworks have their own pre-processor that emits `inlinedQrl` directly because they've already done the analysis and want to hand the optimizer a fully-baked QRL. See `match-these-snaps/qwik_core__test__example_qwik_react.snap` lines 14–48 — every `inlinedQrl` there came from `qwikify$`'s codegen, not a developer's keyboard.
2. **Idempotency.** When the optimizer runs over its own output (or a build pipeline that re-invokes it), it sees `inlinedQrl` calls left from a prior pass. Detection at `extract.ts:954–1089` runs *before* the regular `$()` walker so these don't get double-extracted.
3. **Hand-crafted test fixtures.** Snapshots like `should_preserve_non_ident_explicit_captures.snap` use `inlinedQrl` to exercise edge cases (non-identifier captures, explicit naming) the regular form can't reach.

> **Rule of thumb.** Developers write `$()`. Tools write `inlinedQrl`. If you're hand-writing `inlinedQrl` you almost certainly want `$()` instead.

This pairs with the broader author-vs-tool boundary documented in [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces).

Segment usage — a map of `segmentName → Set<moduleName>` plus a `rootUsage` set — is the gather walk's usage projection (declaration and identifier visits buffered during the walk, classified after it by a sorted range-stack sweep — hoisted declarations are seen first, and the work is linear in visits + extractions rather than visits × extractions per OSS-487). It drives migration (Phase 3, which consumes the pre-built maps); it overlaps conceptually with `captureNames` but operates at module-decl granularity, not closure-scope granularity. The standalone `computeSegmentUsage` (`variable-migration.ts:364`) is the projection's differential oracle.

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

1. **`foo` got consolidated to `_rawProps`.** When a parent's destructured prop is captured, the optimizer rewrites both sides — the parent passes `_rawProps` (the un-destructured object), and the segment reaches into `_rawProps.foo` instead. This is the F3 territory in `CONVERGENCE_FAILURES.md`. After the OSS-356/357/358 split, the consolidation work is delegated to `consolidateRawPropsCaptures` (`segment-generation.ts:372`) which both strategy paths invoke via the shared `tryConsolidateRawProps` wrapper (`segment-generation.ts:431`) — `buildInlineStrategySegment` at line 571, `buildDefaultStrategySegment` at line 1147.
2. **`arg0` got inlined as `20`.** Const-literal captures whose values are statically resolvable get folded at codegen time and dropped from `captureNames`. Logic at `segment-generation.ts:1159` (wires the pre-computed const-literal map into the default-strategy path) and `inlineConstCaptures` in `rewrite/index.ts`.
3. **The captureNames metadata is just `["_rawProps"]`.** The unpacking line `const _rawProps = _captures[0]` is injected by `injectCapturesUnpacking` (`segment/body-transforms.ts:543`) at the start of the segment body.

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

- **Phase 3 (migration)** — `attributeSegmentUsage` (`transform/index.ts:742`) augments the gather walk's `segmentUsage` with `extraction.captureNames` so migration decisions know which module-level decls each segment actually needs.
- **Phase 4 (parent rewrite)** — emits the `.w([...])` capture array on each `q_<symbol>` reference. The emission lives in two passes: `rewriteCallSites` (`rewrite/index.ts:559`, appended at :585 inline with the QRL declaration) for declarations that already exist at the call site, and `addCaptureWrapping` (`rewrite/index.ts:718–755`) for the after-the-fact `.appendLeft` insertion on already-rewritten markers.
- **Phase 5 (segment codegen)** — `addCaptureAndMigrationImports` (`segment/segment-codegen.ts:222`) emits the `_captures` import; `injectCapturesUnpacking` injects the unpacking line. The post-Phase-4 filtered `captureNames` is what gates these; in OSS-346's helper structure, `applyBodyTransforms` returns the filtered version explicitly.

---

## Deep dive: migration policy

When a module-level binding (`const X = ...`, `function fn() {}`, etc.) is referenced from a segment, the optimizer has to decide where the binding lives in the output: in the parent (re-exported so segments can import it), moved into a segment, or just left untouched. That decision is `decideMigration` in `src/optimizer/analysis/variable-migration.ts:633`.

### The three actions

| Action | Effect on parent | Effect on segment |
|---|---|---|
| `keep` | Declaration left untouched | No interaction |
| `move` | Declaration removed (its source range deleted) | Full declaration text inlined into the target segment, with import dependencies threaded |
| `reexport` | Original declaration kept; an `export { name as _auto_name }` line added | Segment emits `import { _auto_name as name } from "./parent"` |

The `_auto_` prefix is the convention for compiler-generated re-exports — distinguishes them from user `export` statements so the runtime can identify them.

### Decision rules

`decideMigration` evaluates rules in order at `variable-migration.ts:633–664`. First matching rule wins. After the main loop, two post-passes run (`analyzeMigration` at :549 sequences them): `promoteSharedDestructureGroups` refines specific shared-destructure cases, then `reexportMovedDeclDependencies` (MIG-06, below) reconciles the dependencies of `move`d declarations.

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
| MIG-06 (post-pass) | dependency of a `move`d decl that would stay un-exported, or that `move`s to a *different* segment | `reexport` | `REEXPORT_MOVED_DECL_DEP` |
| MIG-06a (post-pass) | dependency of a `move`d decl used *only* by movers to the same segment (no export/top-level/other-segment use) | `move` | `MOVE_TRANSITIVE_DEP` |

The intuition: re-export is the safe default whenever **anyone else** still needs the binding (root code, multiple segments, side-effect chain, sibling destructure binding). Move only fires when exactly one segment is the consumer.

### MIG-05a post-pass (added in OSS-338)

MIG-05's blanket re-export rule for shared destructures is correct in cases like `should_keep_non_migrated_binding_from_shared_destructuring_declarator` (some bindings go to root, others to one segment — must re-export so root's binding survives). But when **all bindings** of a shared destructure go to **exactly one segment**, with no root use, no export, no side effects, the entire destructure should `move`.

The `promoteSharedDestructureGroups` post-pass (`variable-migration.ts:681`) walks each shared-destructure group, validates the unanimous-target condition via `unifiedSingleSegmentTarget` (function at line 716), and rewrites the per-binding decisions in place from `reexport` → `move` (with reason `MOVE_SHARED_DESTRUCTURE_UNIFIED`).

This is still incomplete for nested-segment cases — the F4 convergence failure (`example_invalid_references`) is exactly this: parent passes, but segment-level migration fails because the post-pass doesn't yet handle nested-segment unification.

### MIG-06 post-pass (added in OSS-447)

A `move`d declaration's body can still reference other module-level declarations after it leaves the parent (qwik-router's `useQwikMockRouter` references seven context objects this way — names whose only other appearances are inside sibling root helpers, so they land in `rootUsage` and would otherwise `keep`). The `reexportMovedDeclDependencies` post-pass (`variable-migration.ts:573`) mirrors SWC's `precompute_and_declare_auto_exports` plus the `used_by_incompatible_root` arm of its migratable-vars safety filter, in the same order: first demote to fixpoint any `move` whose decl is referenced by another `move` targeting a different segment, then flip every surviving mover's un-exported `keep` dependencies to `reexport`. Segment-side import wiring resolves these through their `_auto_` alias (the `reexportedNames` set in `wireMigration`).

Two related ownership rules ride the same shape (also OSS-447): when a moved helper's body references top-level `q_<symbol>` QRLs, the parent demotes every such binding to a bare `qrl(...)` registration statement (`movedMarkerSymbols` in `rewrite/output-assembly.ts`) and the consuming segment declares them itself plus the `qrl`/marker-Qrl imports (`buildMovedQrlDecl` + `buildMovedQrlSupport`, and the marker-decl variant `tryBuildMarkerDeclMove`, in `segment-generation.ts`). The bare-`qrl(...)` demotion is **prod-only** — under dev/hmr the parent keeps the full `const q_<sym> = qrlDEV(...)` binding and the segment emits `qrlDEV(...)` with source metadata, importing `qrlDEV` (dev builds never import bare `qrl`); the segment also imports the marker-Qrl callee (`componentQrl`, …) it wraps. And the segment-usage projection skips property-position identifiers (`isNonReferenceIdentifier`, shared by `computeSegmentUsage` and the gather walk) so a decl whose name collides with a property name (`document.startViewTransition`) isn't falsely demoted from MOVE to dual-use REEXPORT.

Transitive dependency *migration* is implemented as MIG-06a (OSS-520, mirrors SWC's `collect_transitive_dependencies`): a `keep` dependency used *exclusively* by movers to one segment moves in with them instead of re-exporting, run as a fixpoint so a freshly-moved dep pulls in its own transitive deps (`canMoveInto` in `reexportMovedDeclDependencies`). The move-inline then skips importing a same-file symbol that also moves into the same segment (`movedIntoThisSegment` in `wireMigration`), which would otherwise double-declare it. `inlinedQrl` segments participate in migration wiring too — their explicit captures are *not* folded into `segmentUsage` (they arrive via `_captures`, not an import; `attributeSegmentUsage` skips them for `inlinedQrl`), so a captured-only name stays `rootUsage`/`keep` rather than dual-use `reexport`. This closed the `@qwik.dev/router` lib's `spa_init_event` case (moving `createCurrentPathTracker` + its transitive helpers into the segment), fixing client-side `<Link>` navigation under the TS optimizer. Explicit topological ordering (`sort_migrated_vars_topologically`) is still not implemented — moved decls emit in source order, which is dependency-correct in practice.

### The `usingSegmentsOf` helper (added in OSS-338)

`variable-migration.ts:517–523`:

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
- **Segment codegen** (`segment/segment-generation.ts:765` — `wireMigration`): for `reexport`, add to the segment's `autoImports` (becomes `import { _auto_x as x }`); for `move` targeting **this segment**, inline the declaration text + its own import deps.

### Inline/hoist strategy filter

Under the `inline` / `hoist` entry strategies the segment bodies stay in the parent module, so a decl consumed by a segment is already in scope and most migration is runtime-redundant. `filterInlineStrategyMigrations` (`variable-migration.ts`) keeps only the reexports whose binding is needed *beyond* this module — `REEXPORT_EXPORTED` (MIG-03) and `REEXPORT_DUAL_USE` / `REEXPORT_MULTI_SEGMENT` (MIG-02). Side-effect (MIG-04), shared-destructure (MIG-05) and moved-dep (MIG-06) reexports are dropped, as is every `move` (which would delete an in-parent decl the inline body still references). Emitting the runtime-redundant reexports anyway diverges from SWC and can perturb SSR module-init order — that spurious `_auto_<decl>` was the trigger for the OSS-506 `serverQrl is not a function` crash on the qwik-design-system dev SSR. SWC still emits MIG-02/MIG-03 reexports under inline (e.g. `_auto_STYLES` in `example_reg_ctx_name_segments_hoisted`), which is why the filter is a whitelist, not a blanket drop.

---

## Deep dive: JSX rewrite

The JSX transform converts `<div onClick={...} />` syntax into `_jsxSorted(...)` / `_jsxSplit(...)` helper calls that the Qwik runtime understands. Two entry points: full-module JSX during parent rewrite, and per-segment JSX in Phase 5 of `generateSegmentCode`.

> Both `_jsxSorted` and `_jsxSplit` are **tool-emitted** — they replace the author's `<div ... />` syntax. A developer never imports or calls them directly. Same for `_wrapProp` and `_fnSignal` below. See [Two namespaces](#two-namespaces-what-you-write-vs-what-the-optimizer-produces).

### `_jsxSorted` vs `_jsxSplit`

Both helpers have the same calling shape — `(tag, varProps, constProps, children, flags, key)` — but they differ in how the runtime treats reactive coordination between var and const props.

The choice is made in `jsx/jsx-elements-core.ts:510–513`:

```ts
const hasBindInConst = !tagIsHtml && constEntries.some(e => e.startsWith('"bind:'));
const jsxFn = hasBindInConst ? '_jsxSplit' : '_jsxSorted';
```

`_jsxSplit` fires when:
- The element has a **spread attribute** (handled separately via `buildJsxSplitCall`, lines 344–362).
- A **component element** (non-HTML) carries a `bind:` directive in its const props — two-way binding needs reactive plumbing between the two prop pools.

Otherwise: `_jsxSorted`, which is the common fast path.

### Var props vs const props

Each JSX attribute is classified as either `var` (could change between renders) or `const` (stable for the lifetime of the element). The classification logic lives in `classifyConstness` at `jsx/jsx.ts:567–695`.

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

Why threaded across phases: parent rewrite assigns keys to its own JSX, then segment codegen has to keep counting from where the parent left off so the same key never appears twice. The counter implementation is `JsxKeyCounter` at `jsx/jsx.ts:723–743`, threaded as:

- `parentResult.jsxKeyCounterValue` from `transformAllJsx` (returned at jsx.ts:1124) → into `transform/index.ts:1150` (`generateSegments`).
- `parentJsxKeyCounterValue` → consumed by `segment-generation.ts:1238` and `transformSegmentJsx` (segment/segment-codegen.ts:378) as `keyCounterStart`.
- Each segment's emit returns its updated `keyCounterValue` (`segment-generation.ts:1310`, folded back in the `generateAllSegmentModules` sequencer) — folded back so the next segment continues counting.

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

All fields live on `ExtractionBase` and the phase-tagged variants `ExtractedSegment` / `CapturedSegment` / `ConsolidatedSegment` (split into a discriminated union per OSS-389; see `extract.ts:68–198`). They originate during Phase 1 extraction and travel through every downstream phase.

The `Computed at` column points at the marker-call extraction block (`extract.ts:1092–1232`). Since OSS-479, all four extraction paths construct their record through the shared `buildExtractedSegment` factory (`extract.ts:572`), which owns the shared defaults and derivations (`canonicalFilename`, `loc`, `origin`, `captures`); helpers the block calls live in `marker-detection.ts` (`getExtractionKind`, `getExtractionName`) and `naming.ts` / `siphash.ts` (symbol/hash composition).

| Field | Type | Computed at | Used for |
|---|---|---|---|
| `origin` | `Origin` | `extract.ts:594` (factory derivation from `spec.relPath`) | Source file path; preserved verbatim through pipeline |
| `name` | `SymbolName` | `extract.ts:1203` (default path — `ctx.naming.getSymbolName()`) or `:1200` (OSS-437 import-derived override — `mkSymbolName(importContextPortion + "_" + hash)`); passed to the factory at `:1207` | Canonical symbol name for the segment's exported binding (see [Symbol naming and hashing](#symbol-naming-and-hashing)) |
| `displayName` | `DisplayName` | `extract.ts:1202` (default — `ctx.naming.getDisplayName()`) or `:1198` (OSS-437 override — `mkDisplayName(fileStem + "_" + importContextPortion)`); passed to the factory at `:1207` | Human-readable name without hash; appears in dev tooling |
| `hash` | `Hash` | `extract.ts:1204` (default — `hashFromSymbolName`) or `:1199` (OSS-437 override — `qwikHashFromSeed(importHashSeed)`); passed to the factory at `:1207` | 11-char content-addressed suffix; stable across builds |
| `canonicalFilename` | `CanonicalFilename` | `extract.ts:579` (factory derivation) | `displayName + "_" + hash`; basis for the segment file path |
| `entry` | `string \| null` | `entry-strategy.ts:19–48` (Phase 5) | Routing field — non-null for `single` / `component` entry strategies |
| `parent` | `SymbolName \| null` | initially null at extract; resolved in `rewrite/index.ts:458` (`resolveNesting`) | Symbol name of enclosing extraction (for nested segments) |
| `ctxKind` | `'function' \| 'eventHandler' \| 'jSXProp'` | `extract.ts:1179` (`getExtractionKind`) | Drives downstream branching (e.g., event handlers get JSX-prop emit shape) |
| `ctxName` | `CtxName` | `extract.ts:1181` (`getExtractionName`) | The `$`-marker name (`component$`, `useTask$`, etc.); drives strip rules and HMR injection |
| `loc` | `readonly [ByteOffset, ByteOffset]` | `extract.ts:600` (factory derivation `[argStart, argEnd]`) | Source byte range; used for source map mapping and migration source-range surgery |
| `captures` | `boolean` | `capture-analysis.ts:51` | Quick boolean — does this segment close over outer scope? |
| `captureNames` | `readonly SymbolName[]` | `capture-analysis.ts:26–27` | Actual list of captured names; mutated through Phase 4–5 (props consolidation, const inline, migration filter) |
| `paramNames` | `readonly string[]` | `capture-analysis.ts:40` | Closure parameter names; threaded to `rewriteFunctionSignature` for loop-padding (`_,_1,...`) cases |

### Symbol naming and hashing

Four metadata fields encode different views of the same composed name: `displayName`, `hash`, `symbolName` (a.k.a. `name`), and `canonicalFilename`. They're all derived from a single AST walk that maintains a context stack as it descends into nested marker calls. Understanding the composition is the difference between "this name is a magic string" and "this name is a deterministic function of three things you can read off the source."

#### The four-step pipeline

**1. Walk the AST, push to a context stack** — `ContextStack` (`src/optimizer/extraction/context-stack.ts:49`). Pushed during traversal:

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

- `resolvedSource` = `resolveImportHashPath('./style.css', relPath)` — normalises `./` and `..` against the current file's directory (`extract.ts:404–424`). For `relPath = "test.tsx"` (no directory) the resolved form is just `style.css`.
- `pathTail` = `resolvedSource.split('/').last()` = `style.css`
- `baseName` = `escapeSymbol(pathTail)` = `style_css`
- `importContextPortion` = `baseName` if `importedName === 'default'`, else `<baseName>_<escapeSymbol(importedName)>`
- `displayName` = `<fileStem>_<importContextPortion>` = `test.tsx_style_css`
- `hash` = `qwikHashFromSeed(<resolvedSource>#<importedName>)` = SipHash of `style.css#default` (NOT the usual `scope + relPath + displayName` concat — direct seed bytes)
- `symbolName` = `<importContextPortion>_<hash>` = `style_css_TRu1FaIoUM0`

This keeps the segment hash stable across files importing the same asset under the same name — `useStyles$(css3)` in any file referencing `./style.css` produces the same hash, even though the surrounding context stack differs. Currently fires for the single-Identifier-import case only; SWC's second arm (namespace-member-import: `useStyles$(ns.foo)`) is unimplemented in TS — file when a fixture exercises it. Helper: `getImportArgNaming` (`extract.ts:363`).

`disambiguateExtractions` (below) still runs but the override-hash invariant isn't preserved on collision — collisions recompute via the default `qwikHash(scope, relPath, newContext)` formula, diverging from SWC. The current fixture set has no collisions on the override path; defensively fix when a fixture exercises it.

#### Disambiguation

When two extractions in one file would collide on `displayName` (e.g., a `$()` nested inside a `component$` whose stack already ends at `Foo_component`), `disambiguateExtractions` (`extract.ts:1518`) appends `_1`, `_2`, ... to the second-onwards occurrences and **recomputes the hash** for each renamed entry. This is why `example_multi_capture` shows both `Foo_component_HTDRsvUbLiE` (the outer) and `Foo_component_1_DvU6FitWglY` (the nested one) — the inner `$()` originally shared context with its parent, so it got the `_1` suffix and a fresh hash with `_1` folded into the input. **`inlinedQrl` extractions skip disambiguation** (per OSS-408): peer-tool-supplied names already encode uniqueness via their hash suffix, and appending `_<n>` would rewrite a name the upstream consumer expects.

#### Production rename

In `prod` mode, `applyProdRename` (`transform/index.ts:854`) rewrites every segment's `symbolName` from `<contextPortion>_<hash>` to a short `s_<hash>` to reduce shipped bytes. Applies to `inlinedQrl` extractions too — SWC also renames them under prod, preserving the hash suffix so runtime QRL resolution (hash-keyed) still matches. The original symbolName is preserved in `preRenameSymbolName` for migration-decision keying. The rename is also mirrored in `closureNodes` so post-rename lookups (Phase 4 const-literal resolution, etc.) still find the threaded AST node. `displayName`, `hash`, and `canonicalFilename` are unchanged — the rename is symbolName-only, and runtime resolution still works because the hash is the lookup key.

For `inlinedQrl` whose peer-tool-supplied name has no recognisable hash suffix (the post-`_` portion isn't 8+ alphanumeric — see `extract.ts:977–991`), the full name is used as the hash; prod-rename then produces `s_<fullName>`. Conservative — better to keep more of the name than to fabricate a hash from a name that doesn't follow the convention.

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
  - `consolidateRawPropsCaptures` (`segment-generation.ts:372`, invoked via `tryConsolidateRawProps` from inline-strategy (:571) and default-strategy (:1147)) and `preConsolidateRawPropsCaptures` (`rewrite/index.ts:491–540`) — props field consolidation can replace destructured prop names with `_rawProps`.
  - `segment-generation.ts:1159` — const-literal inlining drops names whose values get folded.
  - `segment-generation.ts:907` — migration filtering drops names that became `_auto_` imports.

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

The per-segment `SegmentMetadataInternal` block is assembled by a single helper — `buildSegmentMetadata` (`segment-generation.ts:447`) — called from both `buildInlineStrategySegment` and `buildDefaultStrategySegment`, each passing its own `entryField` and `outputExtension`. That object lands in the `TransformModule.segment` field for non-stripped segments. The runtime uses `name` + `canonicalFilename` to resolve the lazy import; everything else is for tooling and tests. The two strategy builders date to the OSS-356/357/358 split and still diverge in their upstream segment-code generation; the metadata literal they each once held was consolidated into the shared helper (OSS-474).

---

## Quick reference — code map

Directory layout under `src/optimizer/` mirrors the pipeline: `prepare/` (Phase 0/0.5), `extraction/` (Phase 1), `analysis/` (Phases 2–3), `rewrite/` (Phase 4), `segment/` (Phases 5–6), plus domain layers that cut across phases — `jsx/` (the JSX rewrite), `diagnostics/`, `ast/` (Qwik-agnostic parse/walk/inspect), `edit/` (Qwik-agnostic MagicString write infrastructure), `qwik/` (Qwik API-surface conventions: package names, marker→Qrl mapping, event prefixes, `.w()` emission), `transform/` (the orchestrator + module-level cleanup), and `types/`. There is no `utils/` — a helper belongs to the domain it serves.

| Concern | File |
|---|---|
| Top-level orchestrator | `src/optimizer/transform/index.ts:226` (`transformModule`); per-file driver `transformOneModule` at `:258` |
| Find `$()` calls + initial metadata | `src/optimizer/extraction/extract.ts` — `createExtractionCollector` (per-node handlers, hosted in the gather walk per OSS-496); standalone `extractSegments` retained as differential oracle |
| Symbol naming + hash computation | `src/optimizer/extraction/context-stack.ts`, `src/hashing/naming.ts`, `src/hashing/siphash.ts` |
| Canonical per-module gather walk (hosts Phase-1 extraction) | `src/optimizer/analysis/module-gather-walk.ts` (`gatherModuleFacts`) |
| Capture analysis | `src/optimizer/analysis/capture-analysis.ts`, `analysis/closure-free-identifiers.ts` |
| Migration decisions | `src/optimizer/analysis/variable-migration.ts` |
| Parent rewrite | `src/optimizer/rewrite/index.ts`, `rewrite/output-assembly.ts` |
| Per-segment codegen orchestrator | `src/optimizer/segment/segment-codegen.ts:650` (`generateSegmentCode`) |
| Per-segment body transforms | `src/optimizer/segment/body-transforms.ts` |
| Per-segment import collection | `src/optimizer/segment/import-collection.ts` |
| All-segments orchestrator | `src/optimizer/segment/segment-generation.ts:1327` (`generateAllSegmentModules`) — 34-line sequencer |
| All-segments setup (Prep) | `src/optimizer/segment/segment-generation.ts:480` (`computeSegmentGenerationPrep`) |
| Inline-strategy segment builder | `src/optimizer/segment/segment-generation.ts:563` (`buildInlineStrategySegment`) |
| Default-strategy segment builder | `src/optimizer/segment/segment-generation.ts:1107` (`buildDefaultStrategySegment`) |
| Migration wiring (top-level + nested) | `src/optimizer/segment/segment-generation.ts:765` (`wireMigration`) |
| Nested call-site builder | `src/optimizer/segment/segment-generation.ts:958` (`buildNestedCallSites`) |
| Nested QRL declarations | `src/optimizer/segment/segment-generation.ts:626` (`buildNestedQrlDeclarations`) |
| Raw-props consolidation (shared) | `src/optimizer/segment/segment-generation.ts:372` (`consolidateRawPropsCaptures`) |
| Post-process per segment | `src/optimizer/segment/post-process.ts:158` (`postProcessSegmentCode`) |
| Shared extraction predicates | `src/optimizer/rewrite/predicates.ts` |
| Stripped-segment codegen | `src/optimizer/segment/strip-ctx.ts` |
| Entry strategy resolution | `src/optimizer/segment/entry-strategy.ts` |
| JSX core transform | `src/optimizer/jsx/jsx.ts`, `jsx/jsx-elements-core.ts` |
| Reactive expression hoisting (`_fnSignal`) | `src/optimizer/jsx/signal-analysis.ts` |
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
- `src/optimizer/extraction/extract.ts`
- `src/optimizer/analysis/capture-analysis.ts`, `src/optimizer/analysis/closure-free-identifiers.ts`, `src/optimizer/analysis/module-gather-walk.ts`
- `src/optimizer/analysis/variable-migration.ts`
- `src/optimizer/segment/segment-codegen.ts`
- `src/optimizer/segment/body-transforms.ts`
- `src/optimizer/segment/import-collection.ts`
- `src/optimizer/segment/segment-generation.ts`
- `src/optimizer/segment/post-process.ts`
- `src/optimizer/rewrite/predicates.ts`
- `src/optimizer/rewrite/index.ts`, `rewrite/output-assembly.ts`
- `src/optimizer/jsx/jsx.ts`, `jsx/jsx-elements-core.ts`
- `src/optimizer/jsx/signal-analysis.ts`
- `src/optimizer/segment/entry-strategy.ts`
- `src/optimizer/segment/strip-ctx.ts`
- `src/optimizer/extraction/context-stack.ts`
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
