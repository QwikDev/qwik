# Compiler implementation plan

Status: active working agreement
Last updated: 2026-07-18

Cross-session architecture handoff: [`TARGET_NATIVE_HANDOFF.md`](./TARGET_NATIVE_HANDOFF.md).

This document is the source of truth for completing `packages/compiler/src`. No phase is
complete until its exit criteria and focused tests pass. If implementation exposes semantics not
settled here, stop and ask before choosing behavior.

## Target architecture

```text
TSX
  -> normalization + source map
  -> syntax AST
  -> binding/reference graph
  -> whole-module classification
  -> ComponentShape
  -> semantic RenderPlan
  -> immutable SegmentPlans
  -> ComponentPlan + ModuleBoundaryPlan
       |-> CsrPlan -> CSR emitter
       |-> SsrPlan -> SSR emitter
       `-> segment emitter
  -> range-based module assembly
  -> runtime
```

`RenderPlan` contains semantics only. It never contains HTML strings, DOM paths, or runtime helper
names. Target planners consume a validated `ComponentPlan`; emitters only serialize their target
plans. This is the only production compiler pipeline. OXC normalizes TypeScript with JSX preserved,
parses the normalized source, and handles the ordinary transform only for `not-applicable` modules.

Multi-head SSR and Suspense are outside this implementation. Multi-head investigation remains in
[`MULTI_HEAD_SSR.md`](./MULTI_HEAD_SSR.md). Suspense readiness comes only from stable CSR ranges and
an extensible `SsrOutput`; do not add speculative heads, transactions, reveal queues, or patches.

## Stable internal contracts

```ts
type BindingId = number;
type LifetimeId = number;

interface BindingInfo {
  readonly id: BindingId;
  readonly name: string;
  readonly kind: 'import' | 'module' | 'param' | 'local' | 'loop';
  readonly declarationRange: SourceRange | null;
  readonly scopeId: number;
  readonly ownerId: number;
  readonly import: ImportBinding | null;
}

interface ReferenceInfo {
  readonly range: SourceRange;
  readonly bindingId: BindingId | null;
  readonly role: 'read' | 'write' | 'call' | 'shorthand';
}

interface ModuleAnalysis {
  readonly bindings: readonly BindingInfo[];
  readonly references: readonly ReferenceInfo[];
  readonly exports: readonly ExportBindingInfo[];
  readonly items: readonly ModuleItemPlan[];
}

interface ComponentShape {
  readonly bindingId: BindingId;
  readonly async: boolean;
  readonly setup: readonly SourceRange[];
  readonly returnExpression: SourceRange;
  readonly parameter: ComponentParameterPlan | null;
}

interface ComponentPlan {
  readonly shape: ComponentShape;
  readonly setup: readonly SetupPlan[];
  readonly render: RenderPlan;
  readonly segments: readonly SegmentPlan[];
  readonly lifetimes: readonly LifetimePlan[];
}

interface ModuleBoundaryPlan {
  readonly roots: readonly SegmentReferencePlan[];
  readonly segments: readonly SegmentPlan[];
}
```

Every dynamic render node and effect refers to a `LifetimeId`. A lifetime declares its owner,
parent, async ownership boundary, and atomic commit behavior. `RenderFunctionPlan` may belong to a branch,
slot, row, or dynamic collection, but may not register lifecycle hooks.

The compiler entry returns exactly one result:

```ts
type TransformResult =
  | { kind: 'not-applicable' }
  | { kind: 'success'; modules: TransformModule[] }
  | { kind: 'failure'; diagnostics: Diagnostic[] };
```

Only `not-applicable` may enter the normal OXC path. A qualified compiler error is an atomic
`failure`; the outer API returns diagnostics and an empty input module, never JSX fallback.
`transformModules()` retains its public signature. The runtime cutover exposes source-facing root
functions instead of VNodes:

```ts
type RenderRoot<Props = undefined> = (props: Props) => JSXOutput;

render(parent, Root, options?);
renderToString(Root, options?);
renderToStream(Root, options);
```

The internal compiled `(props, ctx)` ABI remains hidden. Renderers do not accept `<Root />`, a
VNode, or arbitrary JSX output, and no compatibility adapter is allowed. Compiler/runtime ABI
helpers are JavaScript exports of `@qwik.dev/core`, while the generated public declaration entry
exposes only source-facing APIs.

`@qwik.dev/core/spark` no longer exists. `@qwik.dev/core/internal` remains an unstable thin view of
the current runtime ABI, while `@qwik.dev/core/testing` exposes the compiler-backed target-native
test harness without a VNode adapter.
The Qwik Vite plugin always runs this compiler for source modules; the optimizer may remain only
for independent manifest/tooling work. Runtime JSX that cannot be assigned to a supported
component or boundary is an atomic diagnostic. OXC fallback is limited to modules without runtime
JSX, component candidates, or boundaries.

## Settled behavior

### Async and ownership

- Components, dynamic children, branches, slots, loop rows, and collection rows use
  `ValueOrPromise`.
- CSR scalar, branch, content, and reactive-collection subscribers return their DOM/ranges
  synchronously. A DOM batch performs its initial tracked run inside `createDomBatchEffect()`;
  there is no second runtime helper or generated initialization call. A grouped props subscriber
  runs once directly and registers only its returned Promise with `scheduler.waitFor()`; later
  updates use the scheduler. The root mounts the synchronous output and calls
  `scheduler.flushInteraction()` once.
- One-shot component, slot, plain-content, and direct-array collection continuations register their
  actual pending work through `scheduler.waitFor()`. Both the scheduler's Promise list and scalar
  phase collection are allocated lazily only after a real Promise is observed.
- Returned Promises are awaited through `maybeThen`. Manually thrown Promises and thenables are not
  a public contract; framework `AsyncSignal` suspension is retried locally with `retryOnPromise()`.
  Component setup and hook registration run once.
- Every CSR attempt has an owner and generation. Supersede increments generation immediately;
  disposal prevents late DOM, metadata, subscription, cache, or owner commits.
- Existing CSR DOM and its content owner stay active until replacement content is fully ready and
  are swapped atomically.
- A structural content expression is an ordinary `expression` segment. CSR mounts it through the
  single `ContentBlock` subscriber and SSR records it with a compiler-emitted `<!d=id>...<!/d>`
  range plus `renderSsrContent()`. Returned Promises are latest-wins and AsyncSignal suspension is
  retried; this does not add a generic render-boundary abstraction.
- CSR initial tasks execute sequentially in registration order through the existing scheduler. SSR
  owns one request-local `SsrScheduler`; the current sequential renderer uses its root lane only.
  `useTaskQrl()` notifies that lane synchronously, so the first task starts eagerly while linear
  setup continues. A single compiler-emitted lane `flush()` after setup stabilizes direct and
  custom-hook tasks before the first RenderPlan execution, and a final root-lane flush runs before
  styles/state serialization. The synchronous path returns `undefined` and allocates no Promise or
  queue.
- `useVisibleTask$` records runtime metadata but never executes on SSR.
- Async text and native DOM attributes are latest-wins. Component props, props spreads,
  `innerHTML`, events, refs, keys, and reactive/derived keyed rows reject Promise values.
- Internal invariants and duplicate-key checks exist only under `isDev`. Promise scalar values,
  rejected user work, and invalid or Promise loop keys remain production contract errors. Correct
  production paths do not allocate diagnostic structures.
- Do not introduce `rawToOwner`, `registerSsrReactiveValue`, `ssrHeadOwner`, or another reactive
  value registry.

### Compiler-owned IDs and styles

- Compiler hooks are recognized by `BindingId` only when imported from `@qwik.dev/core`.
  Imports from `@qwik.dev/core` are never retargeted implicitly.
- `useConstant()` is a direct untracked initializer in linear component setup. Vdomless setup runs
  once, so it allocates no sequential hook scope, owner state, subscriber, or serialized state.
  Calls outside linear setup receive the stable `custom-hook` diagnostic.
- `useStore()` is likewise a binding-aware linear-setup hook, not a conservative custom hook. Its
  synchronous factory is untracked and runs once. The default store remains deep and reactive;
  `{ deep: false }` uses a separate shallow proxy path, while `{ reactive: false }` returns the raw
  value. Deep payloads keep their existing serdes shape and shallow payloads append their mode.
- `unwrapStore()` and `forceStoreEffects()` are direct store-runtime utilities exposed through
  `@qwik.dev/core`. Forcing a property only notifies an already-existing source owned by a
  reactive proxy; it never allocates a source and raw or non-reactive values remain no-ops.
- `useServerData()` is a synchronous setup-only read from the request container. CSR receives data
  from `render(..., { serverData })`, SSR shares the original render option through its request
  context, and child/custom-hook setup inherits the same container. Its result is initial-only;
  complete server data is never serialized, and only values retained by normal QRL captures become
  state roots.
- `getLocale()`, `setLocale()`, and `withLocale()` are ordinary runtime utilities exported through
  `@qwik.dev/core`. They share the existing core locale implementation and require no
  compiler plan, boundary, subscriber, or import retargeting.
- `useId()` is replaced range-by-range with `_id + 'u<ordinal>'`. Its result is initial-only and
  creates no segment, subscriber, serialized root, or DOM effect. It is valid in linear component
  setup and linear collection-row setup; unsupported placement or arguments receive
  `use-id`.
- A direct read of a compiler-created `useId` binding is emitted as a known string attribute:
  direct `setAttribute()` on CSR and escaped record parts on SSR. Derived expressions keep the
  ordinary attribute serializer because a dependency on a string does not prove a string result.
- The compiler supplies and propagates deterministic ID bases through local components, branches,
  slots, projections, and rows. Branch, keyed-For, and projection serdes preserve that base. A raw
  array row receives an index-derived base only when its render plan needs an ID.
- `useStyles$` and `useStylesScoped$` in linear setup become direct
  `useStyles(styles, styleId)`/`useStylesScoped(styles, styleId)` calls. They create no style QRL or
  implicit segment. Stable style IDs depend on component identity and registration order.
- Scoped IDs are authored by semantic lowering: static template/SSR classes, dynamic class/props
  effects, branches, rows, local JSX factories, and projections receive the author's scope; child
  components keep their own scope. Opaque structural content in a scoped component fails with
  `scoped-style-content`.
- A module-wide `useStylesScoped$` boundary becomes `useStylesScoped(style, styleId, true)`. The
  optional flag lazily appends its scope to the active invoke context; a component with a
  binding-aware custom `use*` reads those scopes once after setup/SSR task flush and applies them to
  the author's JSX. Direct two-argument style hooks retain the statically planned fast path, and
  scopes never propagate into child component invoke contexts. Style registration still dedupes
  before scoped CSS transformation. `createId`, `appendStyle`, and `appendScopedStyle` are not
  compiler-runtime APIs.

### Children, loops, slots, and raw text

- Compiler-generated render functions already return target-native output: `Node | readonly Node[]`
  on CSR and `SsrOutput` on SSR. Generated code must not flatten arbitrary values, filter them, or
  coerce primitives/JSX objects into text nodes. A non-reactive target-native value may be returned
  directly, while reactive structural content always owns a range. Nested CSR composition uses
  planned cardinality: one node is inserted directly, a known node array is iterated directly, and
  only unknown target-native output uses the existing `_toNodes` ABI.
- Every non-static `.map()` returning JSX is lowered to one collection plan with an explicit
  `DirectArraySource`, `DirectReactiveSource`, or `DerivedSource`.
- `items.map()` is a direct array: rows are sequential, the index is a number, JSX `key` is ignored
  for reconciliation, and no `_wrapArray`, key segment, keyed reorder, or SSR row marker is
  emitted. It uses only compiler-emitted mounting anchors, never constructs `ForRange`, and removes
  nested anchors after commit when the retained parent already owns cleanup.
- A direct-array row is emitted as a local target-native function in its owning module. It creates
  no row QRL, QRL hoist, import, or standalone row module; nested event/text/QRL boundaries remain
  independently reachable. It still uses the existing collection runtime path. A speculative
  pure-row runtime flag is intentionally not retained because it increases the shared core runtime
  bundle.
- A proven Qwik `source.value.map()` is directly reactive and requires a synchronous
  `string | number` key. It uses keyed reconciliation and makes the index a `Signal<number>` only
  when the lowered row actually references it.
- A derived or ambiguous reactive receiver uses the existing `_wrapArray`. It also requires a key.
  When its lowered row references the index, the compiler emits `_wrapArray(qrl, true)` so the
  wrapper remains a Source even if dependency collection is empty. Without that index requirement,
  the default `false` path may return the computed array directly.
- Missing keys for direct-reactive and derived sources fail compilation with the stable
  `for-key` diagnostic. Direct arrays do not create a key segment.
- Direct-array row callbacks may return Promises and are awaited sequentially. Direct-reactive and
  derived keyed rows must be synchronous; an async callback or `await` fails atomically with
  `async-for` for both CSR and SSR.
- Plain collections have no keyed reorder or reactive row lifetime, but their callback JSX,
  effects, captures, and segments are fully lowered.
- Keyed `For` keeps its existing synchronous reconcile. This plan does not add an atomic async
  reconcile or change `_wrapArray`. The compiler passes a numeric row-output shape through the
  existing `createCollection`/`ForBlock` ABI, so known elements, nodes, and node arrays bypass
  `_toNodes`; only `unknown` output is normalized. The shape is serialized at the end of the For
  payload, and an older payload defaults to `unknown`.
- A keyed row owns the raw item captured when that key is first created. Reusing the key preserves
  that item, DOM, owner, and event captures even if the source later supplies a different object.
  Only a referenced row index is a Signal; reorder updates index-dependent effects without running
  the row factory again. The compiler never changes item reads to `item.value`.
- Slot projections execute sequentially and update cache only after guarded commit.
- `innerHTML` and JSX children are mutually exclusive.
- Mixed dynamic children in `title`, `textarea`, `script`, and `style` are unsupported and receive a
  stable diagnostic. Do not guess concatenation semantics.
- A setup declaration containing JSX is supported only as one `const` identifier with a direct JSX
  initializer. It lowers to semantic target-native output, never a QRL. A pure single-use value is
  inlined into the owning template/string; repeated or owner-sensitive values remain factories so
  every use receives fresh output. Mutable, destructured, or mixed declarations receive a stable
  diagnostic.
- Side-effect-free inline object spreads with literal values, direct `bind:value`/`bind:checked`
  signal values, and recursively expandable spreads are expanded in semantic lowering. Other
  dynamic values keep opaque object-evaluation semantics. Semantic lowering applies source-order
  last-write-wins once; target planners do not repeat that policy.
- On native elements, direct `bind:value` and `bind:checked` lower to the existing attribute effect
  plus an ordered `q-e:input` handler backed by `inlinedQrl(_val/_chk)`. They create no bind-specific
  subscriber, effect kind, serdes payload, or segment module. User input handlers and bind handlers
  are grouped by target planning in JSX source order.
- Component `bind:*` props remain ordinary props. Opaque native spreads keep `bind:value` and
  `bind:checked` inside their existing props expression; the single `PropsEffect` scan reads the
  signal, emits `value`/`checked`, and appends the built-in handler after an existing input handler.
  Falsy binds are inactive and `bind:checked` wins when both supported binds are present. Other
  native `bind:*` names retain ordinary prop behavior.
- A native `ref` is a one-shot mount operation, not an effect or resumable segment. Semantic
  lowering classifies compiler-known signals and functions while preserving source-order and
  last-write-wins behavior. CSR assigns a known signal or calls a known function directly;
  forwarded/opaque values use `setRef()` only in modules that need runtime type dispatch.
  Component refs remain ordinary props. An opaque native spread exposes its final `ref` from the
  existing `PropsEffect` scan without another pass, and the SSR emitter adds a separate guarded
  `ctx.setRef()` call after the props result resolves. The generic DOM props serializer receives no
  ref callback or target ID and performs no ref side effect. `null` and unshadowed `undefined`
  suppress an earlier ref without generated work.
- SSR refs force a stable `q:id`. `ctx.setRef()` stores a minimal server-only element reference in
  signals or passes it to function refs before the element output is committed. The serializer
  writes the reserved `RefVNode` type with only the node ID, and client allocation resolves it
  through the existing `findQwikElement()` path. Refs add no subscriber, effect kind, scheduler
  work, QRL, or cleanup callback; callback return values are ignored.
- A direct-array index and a `const` identifier initialized by a recursively literal-only object or
  array are `initial-only` bindings. An expression whose local dependencies are all
  `initial-only` stays inline and creates no QRL, subscriber, serialized root, or SSR `q:id`.
  Spreads, computed keys, shorthand, methods/accessors, `__proto__`, calls, and nested Sources do
  not qualify. A direct-array index does not suppress an effect that also reads a potentially
  reactive item.
- Static attribute serialization is name-aware and shared by both target planners: `null` is
  omitted; ARIA, `spellcheck`, `draggable`, and `contenteditable` booleans become strings; ordinary
  `false` is omitted and ordinary `true` is a presence attribute. Matching is case-insensitive
  after attribute-name normalization.
- Ordinary component props, spreads, and `innerHTML` remain binding-aware inline expressions; they
  do not create resumable identity segments. Event props and true nested explicit or implicit QRL
  boundaries remain segments, and linker reachability starts from those nested boundaries only.
- An object-pattern component parameter still executes once in setup, but render-owned text, attr,
  props, content, branch, slot, and row segments destructure their referenced bindings from the
  current props object on every execution. Setup-derived locals, tasks, and event closures retain
  the initial setup values. Aliases, defaults, and rest use the original source pattern.
- A reachable resumable segment may capture a direct module reference or a QRL. If binding-aware
  analysis proves that a called property of a captured local object/array resolves to a plain
  imported, local, or inline function, transformation fails atomically with
  `non-serializable-capture`; unknown aggregates are not rejected speculatively.
- A render function records bindings referenced by its lowered setup and render tree after static
  folding. Target planners select the shortest positional source-parameter prefix and separately
  report whether the generated function needs `ctx`; segment emitters only map those binding IDs to
  source parameter names. Full source callback parameter names remain in metadata.

### Target-aware implicit `$`

- A named, non-type import whose imported binding ends in `$` is an implicit boundary regardless of
  its source module. Aliases are resolved by `BindingId`. An exported local binding ending in `$`
  is also a boundary. Default imports, namespace members, computed members, type-only imports, and
  shadowed bindings are not boundaries.
- Boundary extraction applies to the whole module, not only component bodies. A module with no
  component candidate but at least one qualifying boundary is compiled successfully and emits its
  segment modules; only a module with neither components nor boundaries is `not-applicable`.
- Boundaries in preserved helpers and custom-hook modules belong to `ModuleBoundaryPlan`. Their
  segments use direct captures and no component lifetime or parameter projection; component-owned
  boundaries retain the component lifetime and existing render semantics.
- Qwik `$`, `component$`, and `sync$`, plus JSX props ending in `$`, keep their dedicated semantics.
  Generic implicit calls carry a neutral `ImplicitDollarPlan` with marker binding, base name,
  source/local identity, exact call ranges, and
  generic/serializer/task/visible-task/style/scoped-style role.
- Every resumable boundary has an immutable segment in both builds. The CSR build must emit that
  segment because SSR-generated resumability metadata refers to the same module symbol.
- CSR statically imports the segment and calls the same-source direct API: `foo$(fn, rest)` becomes
  `foo(_withCaptures(segment, captures), rest)`. Capture-free functions use `foo(segment, rest)`.
  CSR creates no QRL object, `_qrlWithChunk`, `.w()`, or `fooQrl` call for this setup operation.
- `_withCaptures` is the existing ABI that sets `_captures` before an extracted function executes;
  do not replace it with a second callback copy or a new runtime capture mechanism.
- A non-function first argument is emitted as a segment value and passed directly on CSR. Qwik
  `useSerializer$` values with captures are emitted as serializer factories and bound through the
  existing `_withCaptures` ABI. Other value payloads may reference module bindings but may not
  capture component/local scope; that case receives stable `C03` diagnostics.
- SSR calls the same-source `fooQrl` with the standard QRL segment and `.w(captures)` when needed.
  Task and visible-task policies remain target-specific setup behavior.
- A binding-aware call to an unknown local or a `use*` imported from another module in linear
  component setup marks possible hidden task/style registration. Every `use*` imported from
  `@qwik.dev/core` or `@qwik.dev/core` is a framework hook and never takes this conservative
  path; hooks that need compiler semantics still have exact variants. Namespace or computed custom
  hooks, and custom hooks in rows, branches, or render functions, fail with a stable `custom-hook`
  diagnostic rather than receiving runtime discovery logic.
- Imported target availability is a module contract; the compiler emits the target import and lets
  the bundler report a missing external export. Local markers require an exported `foo` on CSR and
  exported `fooQrl` on SSR, otherwise transformation fails atomically.
- Existing target imports and aliases are reused. Marker imports are retained only when the marker
  also has an untransformed value use. Import edits are range-based and preserve attributes,
  comments, and order.
- `inlinedQrl(symbol, name, captures)` is already a complete, target-neutral QRL. Preserve the call,
  import, symbol name, and explicit capture order without extracting another segment.

### Sequential SSR ABI

```ts
type SsrOutput = SsrChunk | readonly SsrOutput[];
type SsrChunk = string | SsrReferenceChunk | SsrRecordChunk;

interface SsrEventAttrChunk {
  readonly type: 'event-attr';
  readonly name: string;
  readonly valueParts: readonly (string | SsrReferenceChunk)[];
}

type SsrReferenceChunk =
  | { readonly type: 'node-id'; readonly localId: number }
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-ref-path'; readonly localPath: readonly number[] };

interface SsrRecordChunk {
  readonly type: 'record';
  /** Present only for compiler-known start-tag records. */
  readonly element?: string;
  readonly parts: readonly (string | SsrReferenceChunk | SsrEventAttrChunk)[];
}
```

SSR is strictly sequential: sibling 2 starts only after sibling 1 settles; rows and slot
projections also remain sequential. Returned Promises are awaited in that order, while async
signals retry through their dedicated effect path without repeating component setup. IDs, roots,
captures, styles, and events are assigned only in the ready sequential continuation.
For Source-capable keyed collections, the compiler marks a single-element row with `q:row` and
wraps every other row in a typed `<!r=...>...<!/r>` record. Direct-array rows have no row marker.
The target plan separately records whether a row actually uses `rowId`; SSR allocates it only in
that case. A direct array allocates no collection ID and emits no outer `<!f>` range. Runtime
collection helpers render row output unchanged and do not receive a row-marker flag. If every SSR
row is a string, the runtime returns one joined string; structured rows remain structured output.
The compiler likewise emits typed `<!s=...>...<!/s>` records for slot projections and fallbacks;
the slot runtime renders their output unchanged.
Compiler-known output arrays are flattened and adjacent strings are joined before serialization.
A dynamic value is returned directly when it is the whole output; `maybeThen` is emitted only when
resolution must be followed by another ordered operation or by prefix/suffix composition.

`useOn`, `useOnDocument`, and `useOnWindow` reuse their public v2 APIs. They lazily record events in
the active component scope, including calls made by custom hooks. CSR attaches JSX
handlers first and recorded handlers second to the first real element; a headless global event uses
one hidden script carrier and a headless element event is ignored with a dev-only warning. An SSR
visible task is lowered through `useOn`/`useOnDocument`; the private scope recorder is not part of
the compiler-runtime ABI. SSR marks only the first possible element of each planned output as a
carrier; later start tags remain strings or ordinary records when they contain typed references or
events. A root branch/content replacement applies the recorded scope to the
new target-native output and then the
ordinary range replacement removes the complete old carrier; there is no carrier registry or
mutation log. SSR uses typed event chunks inside element records, merges handlers before record
materialization, and relocates a headless document carrier into `<head>` without parsing HTML.

One `SsrOutputWriter` recursively consumes the output, materializes a whole record before one
`write()`, keeps at most one write in flight, serializes HTML/state/loader/event scripts/closing
tags, and owns the only `finish()` path. `renderToString()` and `renderToStream()` use that same
writer. Do not add `SsrHead`, transactions, remapping, `maybeFork()`, or Suspense patches.

## Implementation phases

### 1. TypeScript normalization

Status: implemented; final verification in progress

- `normalizeTransformInput()` returns original source, JS+JSX, and optional normalized-to-original
  map.
- OXC preserves JSX and produces a map only when `options.sourceMaps` is enabled.
- With maps disabled, no mapper or extra mapping structures are created.
- Diagnostics and metadata are finally expressed in original TSX coordinates.

Exit: normalized parsing works for TS/TSX with and without maps, including mapped diagnostics.

### 2. Parsing

Status: implemented; final verification in progress

- Parse only normalized code.
- Keep the AST syntactic; name meaning belongs to binding analysis.
- Every source range can be converted to original input coordinates.

Exit: parser tests prove normalized ranges and no semantic name heuristics.

### 3. Scope and binding graph

Status: implemented; final verification in progress

- Preserve binding IDs through every later plan.
- Cover hoisting, shadowing, destructuring, `var`, class scopes, nested functions, QRL owners, and
  shorthand properties.
- Property keys, strings, and unrelated shadowed bindings are never captures.
- Recognize public hooks and source factories imported from both `@qwik.dev/core` and
  `@qwik.dev/core`.
- Record local exports and exact import specifier ranges so implicit markers and their target
  implementations are linked without name heuristics.

Exit: binding-aware capture tests cover hoisting, shadowing, destructuring, class scopes, nested
QRL and non-QRL functions, and prebuilt `inlinedQrl` passthrough.

### 4. Whole-module classification

Status: implemented; final verification in progress

Every top-level statement has exactly one classification:

```ts
type ModuleItemPlan = PreserveItem | ImportItem | ComponentCandidateItem;
```

A candidate is recognized by imported `component$` binding identity, a binding used as a JSX tag,
or an exported function/arrow whose return position contains JSX. Never use PascalCase. An exported
conditional JSX return qualifies and then receives a shape diagnostic; a string helper such as
`formatName()` remains preserved. No candidates means `not-applicable` only when module-wide QRL
extraction also found no qualifying boundary. Any later error means atomic `failure`.

Exit: classification tests cover helpers, aliases, shadowing, tag use, `component$`, and invalid
qualified candidates.

### 5. `ComponentShape`

Status: implemented; final verification in progress

- Support zero or one parameter: identifier or object pattern with aliases, defaults, and rest.
- Support expression body or exactly one direct top-level return after linear setup.
- Preserve `async`.
- Reject top-level control flow, multiple/conditional returns, statements after return, and all
  unsupported shapes with `unsupported-component-shape`.
- Never create a partial shape or fall back after qualification.

Exit: all supported shapes produce stable ranges/bindings and unsupported shapes fail atomically.

### 6. Semantic JSX lowering

Status: implemented; final verification in progress

- Lowering is the only JSX classification phase.
- Model element, text, dynamic value, component, branch, slot, collection, and DOM effect
  explicitly.
- Ordered props preserve source order and last-write-wins semantics.
- Diagnose Suspense, innerHTML+children, unsupported raw-text children, and unknown syntax.
- Recursively lower callback JSX once, classify its receiver as direct-array, direct-reactive, or
  derived, and retain that source kind for both target planners.
- Keep ordinary component props inline while retaining binding-aware references to true nested QRL
  boundaries.
- No unprocessed JSX may remain in successful output.

Exit: target-neutral RenderPlan fixtures cover every variant without HTML, paths, or helper names.

### 7. Immutable QRL segments

Status: implemented; final verification in progress

- Store binding-aware captures, exact module references, parameter bindings, async/await ranges,
  direct vs loop-value access, normalized hook options, and optional `RenderFunctionPlan`.
- Edit only ranges identified by `ReferenceInfo`.
- Expand shorthand captures binding-aware; leave strings and property keys unchanged.
- Remove regex-based loop capture, task strategy, and import-usage rewriting.
- Store the neutral implicit-`$` boundary and payload kind (`function` or `value`) without choosing
  the CSR direct API or SSR QRL API in extraction.
- Module-level segments have `lifetimeId: null`; component validation continues to require a real
  lifetime for every segment owned by a `ComponentPlan`. Never synthesize a component or lifetime
  solely to transform a helper module.

Exit: segment fixtures prove exact capture/import behavior and original TSX metadata locations.

### 8. Final `ComponentPlan` and validation

Status: implemented; final verification in progress

- Combine shape, setup, semantic render tree, segments, effects, and lifetime graph.
- Validate binding/capture completeness, owners, lifetimes, async boundaries, ordered props, and
  target emitter coverage.
- Remove `unsupported` sentinels and semantic `null` results.
- No validation error may reach a target planner.

Exit: one phase fixture displays bindings -> classification -> shape -> render -> segments ->
component plan, and invalid graphs are rejected deterministically.

### 9. `CsrPlan`, CSR emitter, and runtime

Status: implemented; final verification in progress

- `planCsr()` computes templates, typed refs, ranges, merged static text, and mount/effect
  operations plus exact return mode (`sync | maybe-promise`) and output shape
  (`element | node | many | unknown`); the emitter only serializes this plan. Scheduler-registered
  work does not make a function's returned DOM asynchronous.
- Before target planning, a memoized binding-aware resolver computes local component cardinality.
  Single node/text components are `one`, fragments/branches/slots/collections/multiple roots are
  `many`, and external components or cycles are `unknown`; only `unknown` uses `_toNodes`.
- Structural placeholders use `<!---->`. `rangeText` retains a text marker; sole-child
  `elementText` may use a text node.
- Compute DOM paths only after the final template plan is assembled.
- Give reactive structural content stable start/end comments and an owned subscriber, including a
  reactive sole root. A sole root component returns `createComponent(...)` directly, and an empty
  render returns `[]` without an empty template.
- Local synchronous components and JSX factories compose without `maybeThen()` or
  `scheduler.waitFor()`. `createComponent()` receives only required options such as `slotScope`;
  the compiler does not emit a redundant `{ container: ctx }`.
- Reuse the existing `ValueOrPromise` utilities with synchronous fast paths; do not add a generic
  render-segment retry helper.
- Emit one `scheduler.notify()` for each scheduled subscriber. A DOM batch performs its one
  initial tracked run during construction and needs no generated `notify()`, `.run()`, or helper
  call. Subscriber-based operations do not wrap their returned anchors in identity `maybeThen`
  calls.
- Register only genuine one-shot continuations with `scheduler.waitFor()`. Returned-Promise
  insertion remains compiler-planned; the runtime does not normalize arbitrary output.
- Scheduler phases retry framework AsyncSignal suspension, serialize attempts of the same
  subscriber, batch scalar Promise collection, and preserve synchronous fast paths. Do not add
  async keyed `For`.
- Root `render()` mounts the returned nodes/ranges, drains initial subscriber/one-shot/blocking work
  through one `flushInteraction()`, rolls back owner and mounted DOM on rejection, and performs
  owner-first idempotent cleanup.
- Emit compiler-owned `useId` bases and direct style setup/scopes; components without IDs or styles
  receive no corresponding runtime work or allocation.
- For implicit-`$`, statically import the emitted segment and pass it through `_withCaptures` only
  when the function has captures. Select the same-source direct API and emit no QRL object.
- A nested event/QRL in a dynamic props expression is captured once in component setup and passed
  to the props segment in its original property position. Re-running the props subscriber does not
  allocate another `_withCaptures()` wrapper.

Exit: focused CSR tests cover adjacent anchors, returned Promises, setup-once, stale completion,
cleanup, task order/custom hooks, async signals/text, atomic `For`, slots, and contexts.

### 10. `SsrPlan`, SSR emitter, and sequential runtime

Status: implemented; final verification in progress

- `planSsr()` creates ordered output/effect/component/branch/slot/loop/collection operations; the
  emitter never analyzes source.
- All boundaries return `ValueOrPromise<SsrOutput>` and await returned Promises. Async signals use
  their dedicated retry path; manually thrown Promises and thenables are unsupported.
- Direct and custom-hook tasks use the server-only request scheduler. The compiler emits ordinary
  `useTaskQrl()` setup and, only for a component that can register task work, one
  `maybeThen(ctx.scheduler.flush(), renderContinuation)`. The continuation restores the component
  invoke context. The emitter never calls `runTaskSubscriber()`, manually adds a task root, or
  forces the component function to be `async`. `useVisibleTask$` remains an event carrier and never
  enters the SSR scheduler.
- `runTaskSubscriber()` and cleanup return `ValueOrPromise<void>` and allocate a Promise list only
  after observing actual async cleanup. A lane starts the first task during `notify()`, queues later
  registrations lazily, drains invalidations and failures in registration order, and performs no
  I/O or global metadata commit.
- Preserve strict sibling/row/projection order and the sync fast path.
- Allocate resumability metadata only after async work is ready.
- Preserve structured records and typed references.
- Emit a compiler-proven static root with no setup, calls, events, typed references, or dynamic
  operations as one string, including static multi-root fragments. Other roots retain structured
  element records. Reuse one lazily
  materialized element-effect target when an element has multiple immutable effect targets.
- Captures used only by an event QRL are registered by QRL serialization and are not redundantly
  added as SSR roots.
- `renderSsrContent()` tracks and serializes structural dependencies and ownership but never emits
  markers; the SSR emitter owns the `d` marker record and keeps SSR evaluation sequential.
- Return a sole dynamic SSR step directly from its planned expression; materialize a temporary only
  when ordered prefix/suffix composition or a later operation requires one.
- Resolve local component synchrony from the SSR plan itself, with memoization. Only a fully
  synchronous SSR component is inlined; external, cyclic, explicitly async, task-blocking, or
  Promise-capable SSR output retains `maybeThen`.
- `rangeId` and `rowId` parameters exist only when the target plan uses their marker/range; retain a
  positional placeholder only when a later runtime argument requires it.
- Route every byte through the one `SsrOutputWriter` shared by string and stream APIs.
- For implicit-`$`, select the same-source `fooQrl` API and pass the ordinary segment QRL with
  binding-aware captures; never derive target names ad hoc in the emitter.

Exit: SSR tests cover returned Promises and async-signal retry without duplicated metadata,
sequential starts, atomic record writes, backpressure, a single writer/finish path, and
string/stream parity.

Direct `useStyles`/`useStylesScoped` calls, compiler-owned style IDs, and scoped class propagation
use the same semantic and target plans; they do not retain or reintroduce a second compiler
pipeline.

### 11. Segment emission

Status: implemented; final verification in progress

- Plan CSR and SSR render-function segments with the same semantic rules as components.
- Emit exact named/default/namespace imports for module references.
- Export required local declarations through range insertion without reordering them.
- Reject a component extracted to a separate module when it writes to a mutable top-level binding;
  emit a stable diagnostic instead of generating setter/proxy ABI.
- Keep segment `loc` and metadata in original TSX coordinates.
- Do not use names or regular expressions for semantic decisions.

Exit: segment modules have exact imports/captures, no regex semantics, and correct source maps.

### 12. Range assembly, source maps, result wiring, and cleanup

Status: implemented; final verification in progress

- Use `magic-string` for range edits and compose its decoded map with OXC's map through Node's
  built-in `SourceMap`; do not add separate source-map dependencies.
- Preserve directives, comments, side effects, helpers, ordinary exports, import attributes, and
  statement order. Modify Qwik imports at specifier ranges rather than reconstructing blocks.
- Compute target-specific transitive segment reachability before module emission. Main/component
  import liveness is binding- and range-based; unreachable segments, QRL hoists, and eager
  component/CSS imports are not emitted, while side-effect-only imports remain untouched.
- A local component referenced only by a lazy branch/slot/row segment is imported by that segment,
  not eagerly by its parent component module. An exported component binding remains imported by
  the main module so its public export is still defined.
- Component modules import only bindings referenced by preserved setup and the lowered target
  plan. Segment modules import only their target-reachable `ModuleReferencePlan`s; no generated-code
  scan or name-based liveness decision is allowed.
- Emit maps for main, component, and segment modules when requested.
- Make `transformModule()` return the real result union and use an exhaustive switch in
  `index.ts`.
- Run the full current compiler fixture matrix and focused CSR/SSR behavior matrix. Explain every
  semantic snapshot change; never bulk `-u`.
- Keep the removed stage pipeline, its private models/helpers, and mutable manifest deleted. Leave
  no flat `HtmlPart` adapter or second production pipeline.

Exit: one production pipeline remains, every qualified error is atomic, module contents/maps are
preserved, and all verification below passes.

## Acceptance fixtures

- A canonical phase fixture shows input -> bindings -> classification -> `ComponentShape` ->
  `RenderPlan` -> `SegmentPlans` -> `CsrPlan` -> `SsrPlan` -> modules.
- Its collection fixture covers both `Source<readonly Item[]>` with `.value.map()` and plain
  `items.map()` and proves that semantic lowering records `DirectReactiveSource` versus
  `DirectArraySource` before target planning.
- Runtime fixtures prove that the Source case selects keyed `For`, the array case stays sequential,
  and only the Source case requires a synchronous key. Row-shape fixtures cover element, node,
  many, unknown, serialization fallback, and reactive resume.
- ID fixtures cover component, branch, slot/projection, keyed row, and direct-array row propagation,
  including serialize/inflate reuse of keyed-row index signals.
- Style fixtures cover direct global/scoped setup, dedupe-before-transform, static and dynamic
  scope ownership, child components, projected JSX, and opaque-content diagnostics.
- Async fixtures prove that subscriber work is started by one scheduler notification, one-shot
  continuations use `waitFor()`, scalar Promises start before their shared wait, and synchronous
  output receives no Promise-list allocation.
- SSR task fixtures prove eager first-task start, sequential registration order, sync `flush()`,
  invalidation draining, immediate rejection observation, custom/direct task ordering, and the
  final request flush before serialization. Custom-style fixtures cover static/dynamic class,
  props, branch/row/projection ownership, and child-component scope isolation.
- Module preservation covers `'use strict'`, `version`, `formatName`, comments, side effects,
  ordinary exports, import attributes, and maps.
- Capture fixtures cover shadowing, destructuring, `var`, class scopes, nested QRL, nested non-QRL
  functions, and prebuilt `inlinedQrl` captures.
- Implicit-`$` fixtures cover core, third-party and local markers; aliases, shadowing,
  type-only/default/namespace exclusions; target alias reuse/collisions; nested calls; async
  segments; function captures; capture-free values; and missing local companions.

## Runtime cutover status

- `packages/qwik/src/core/index.ts` is the single compiler/runtime JavaScript ABI. The curated
  `packages/qwik/src/core/public.ts` declaration entry is the public source API.
- The target-native implementation lives directly in `packages/qwik/src/core/component`, `dom`,
  `reactive`, `runtime`, and `ssr`. There is no intermediate runtime directory, compatibility
  barrel, or second core entrypoint.
- The VNode renderer, cursor/diff pipeline, old SSR JSX/container/backpatch implementation, old
  hook/reactive implementations, and public `spark` entrypoint are removed. The `internal` and
  `testing` subpaths remain thin target-native entrypoints; source-level JSX types and compiler
  markers remain.
- Legacy `core/tests` cases are classified individually in
  `packages/qwik/src/core/tests/LEGACY_TEST_MIGRATION.md`; DOM/serialization/resume behavior
  is migrated, while full component rerender and VNode-tree assertions are explicitly excluded.
- Server output is a separate bundle but not a second stateful runtime. Signals, QRLs, owners,
  invoke state, and serialization state are imported from the singleton `@qwik.dev/core` module.
  The renderer, request scheduler, output helpers, and their tests live directly in
  `packages/qwik/src/server`; there is no intermediate server runtime directory.
  `packages/qwik/src/server/qwik-copy.ts` is the only relative core boundary and duplicates only
  explicitly selected stateless constants/types/utilities whose identity cannot affect runtime
  behavior.

## Verification policy

Run focused checks while developing, then before declaring cutover complete:

```text
targeted packages/compiler/src Vitest files
pnpm vitest run packages/compiler/src/index.unit.ts
targeted packages/qwik/src/core specs
pnpm build.compiler
pnpm build.core.dev
pnpm tsc.check
pnpm api.update if public exports or documented source locations changed
git diff HEAD --check
```

All existing compiler fixtures must preserve semantics or receive an explicitly agreed diagnostic.
Add a new changeset for `@qwik.dev/compiler` and `@qwik.dev/core`; do not modify the existing
implicit-`$` changeset. Preserve all pre-existing staged work and inspect the complete
`git diff HEAD` throughout.
