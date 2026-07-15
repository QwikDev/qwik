# Target-native Qwik handoff

Status: cross-session context
Last updated: 2026-07-18

This document is the shortest complete map of the target-native compiler/runtime work. Read it
before changing `packages/compiler`, `packages/qwik/src/core`, or `packages/qwik/src/server`.

It does not replace the authoritative documents:

- [`PLAN.md`](./PLAN.md) is the source of truth for settled compiler/runtime semantics.
- [`MULTI_HEAD_SSR.md`](./MULTI_HEAD_SSR.md) contains the deferred multi-head and OOOS design.
- [`packages/qwik/AGENTS.md`](../qwik/AGENTS.md) defines package-level implementation rules.

If code, this handoff, and `PLAN.md` disagree, inspect the focused tests and ask before inventing a
new semantic rule. Do not silently preserve a legacy behavior or update a snapshot to hide a
regression.

## Objective

Qwik now has one production source-to-runtime path:

```text
TSX
  -> @qwik.dev/compiler
  -> target-native CSR or SSR modules
  -> @qwik.dev/core runtime ABI
  -> DOM or SSR output
```

The goal is resumability without VNodes, hydration, component rerendering, or a second optimizer
pipeline. The compiler should move every decision known statically out of downloaded runtime JS.
The runtime should contain only work that genuinely depends on values available at execution time.

The primary optimization target is the combined cost of:

```text
downloaded JS + parse/compile + initial render + update hot paths + retained memory
```

Smaller runtime code is usually preferred, but not at the expense of measured hot-path
performance. Compiler output may be more explicit when that removes generic runtime logic.

## Current source layout

The temporary `rewrite` and `vdomless` directory names have been removed.

```text
packages/compiler/src/
  normalization.ts          TypeScript normalization and source-map input
  parse.ts                  OXC parsing
  analysis.ts               scopes, bindings, references, imports and exports
  discover.ts               module/component qualification
  shape.ts                  supported ComponentShape validation
  extract.ts                syntactic boundary extraction
  segment-plan.ts           binding-aware SegmentPlan creation
  semantic-lower.ts         semantic JSX and setup lowering
  validate-component-plan.ts
  plan-csr.ts               CSR templates, ranges, operations and ABI choices
  plan-ssr.ts               sequential SSR operations and output choices
  emit-csr.ts               mechanical CSR serialization
  emit-ssr.ts               mechanical SSR serialization
  emit-segment.ts           target segment serialization
  module-assembly.ts        range-based imports, replacements and source maps
  transform.ts              orchestration and result union
  index.ts                  public compiler entry

packages/qwik/src/core/
  public.ts                 source-facing public declarations
  index.ts                  compiler/runtime JavaScript ABI
  internal.ts               intentionally retained unstable internal subpath
  component/                component setup, props and ownership
  dom/                      templates, ranges, effects, branches, content, slots and collections
  reactive/                 signals, computed/async values, stores and dependency tracking
  runtime/                  owners, invoke context, scheduler, tasks and setup hooks
  shared/                   QRL, JSX types, serdes, platform and neutral utilities
  ssr/                      typed SsrOutput and the ordered output writer
  tests/                    compiler-backed feature specs

packages/qwik/src/server/
  ssr-render.ts             request orchestration and public render implementation
  ssr-scheduler.ts          request-local task lanes
  ssr-event-attr.ts         typed event attributes
  ssr-events.ts             event/QRL serialization
  ssr-script-emitter.ts     state, loader and event scripts
  ssr-use-on.ts             SSR useOn carrier handling
  ssr-ref.ts                server DOM references
  string-writer.ts          renderToString sink
  qwik-copy.ts              approved stateless copies from core
```

There must be no compatibility barrel restoring `rewrite`, `stages`, `spark`, or `vdomless`.

## Compiler pipeline and responsibility boundaries

The production compiler flow is:

```text
normalization + normalized-to-original map
  -> syntax AST
  -> binding/reference graph
  -> whole-module classification
  -> ComponentShape
  -> semantic RenderPlan
  -> immutable SegmentPlans
  -> ComponentPlan + ModuleBoundaryPlan
       |-> CsrPlan
       |-> SsrPlan
       `-> target segment plans
  -> emitters
  -> range-based module assembly
```

Responsibilities are strict:

- `analysis` owns identity: `BindingId`, scopes, references, imports and exports.
- `discover` only decides which module items are candidates.
- `shape` validates supported linear component structure.
- `semantic-lower` is the only place that assigns JSX meaning.
- `SegmentPlan` owns captures, module references, parameters, await ranges and QRL metadata.
- `ComponentPlan` combines shape, setup, render semantics, segments and lifetimes.
- CSR/SSR planners choose templates, ranges, output shape, markers, IDs and runtime ABI.
- Emitters serialize target plans. They must not inspect source text, helper names, or emitted code.
- Assembly edits original ranges and imports. It must preserve directives, comments, ordering,
  aliases, import attributes, ordinary exports and side effects.

Do not introduce a generic post-processing pass over generated code. Do not make semantic
decisions using regexes or identifier text when a `BindingId` is available.

## Transform result and qualification

The transform result is a closed union:

```ts
type TransformResult =
  | { kind: 'not-applicable' }
  | { kind: 'success'; modules: TransformModule[] }
  | { kind: 'failure'; diagnostics: Diagnostic[] };
```

- `not-applicable` is valid only for modules without component candidates, qualifying boundaries,
  or runtime JSX. It continues through the ordinary OXC transform.
- Once a module qualifies, every compiler error is an atomic `failure` with no JSX fallback.
- Unsupported runtime JSX must receive a diagnostic; it may not reach a runtime JSX factory.
- One invalid component or reachable boundary invalidates the module set.

A supported component has zero or one parameter, linear setup, and one direct top-level return (or
an expression body). Conditional top-level returns, loops, switch, try, statements after return,
and other unsupported control flow receive the component-shape diagnostic.

## Module-wide `$` boundaries

Boundary extraction is module-wide and does not depend on finding a component. This is required for
imported custom hooks and helper modules.

Qualifying implicit boundaries follow optimizer-compatible binding rules:

- a named import ending in `$` from any module;
- a local exported binding ending in `$`;
- aliases and shadowing resolved by `BindingId`;
- default, namespace, computed-member and type-only imports do not qualify.

`$`, `sync$`, `component$`, JSX event props, styles and other dedicated markers keep their specific
semantics. `inlinedQrl()` is already a QRL and must not be extracted again.

Target representation differs:

```text
CSR: foo$(closure, ...rest) -> foo(direct closure with captures, ...rest)
SSR: foo$(closure, ...rest) -> fooQrl(qrl(segment).w(captures), ...rest)
```

CSR closures still need captures; direct execution does not mean capture-free execution. A
boundary-only module is a compiler success and emits all reachable nested segments.

## Bindings, captures and props

- Captures and module references are always binding-aware.
- Shorthand object properties are expanded by reference ranges, never by regex.
- Property keys, strings and unrelated shadowed bindings are not captures.
- Reachability is target-specific and transitive. Every imported segment must have a module and no
  segment module may be orphaned.
- Component props remain inline expressions, including getters and spreads. They do not receive an
  identity wrapper segment.
- Destructured component props are live in render effects: the source pattern is recreated from the
  current props object before text, attr, branch, content, slot or row execution. Setup locals,
  tasks and event closures retain their setup-time value.
- Props preserve source order and one semantic last-write-wins decision.
- Only safe literal object spreads are expanded statically. Opaque spreads use the single existing
  props path.
- A statically proven function hidden inside a captured aggregate is rejected as a
  non-serializable capture. Direct module references and QRL values remain valid.

## Render semantics and ownership

`RenderPlan` is semantic only. It contains elements, text, dynamic values, components, branches,
slots, collections, effects and local renderable values. It contains no HTML strings, DOM paths or
runtime helper names.

Every dynamic node/effect has a `LifetimeId`. Every subscriber belongs to an owner. Component
setup and hook registration execute exactly once; reactive DOM updates do not rerun a component.

Local JSX assigned in linear setup is lowered to a target-native factory. Repeated use creates
fresh output. A single use in the same lifetime may be inlined by target planning. It is not a QRL
unless a real nested boundary requires one.

## CSR model

CSR target planning owns templates, references, stable ranges, return mode and output shape.

- Static DOM belongs in `createTemplate()` output.
- Structural boundaries use compiler-planned anchors/ranges.
- Known single-node output bypasses `_toNodes`; only unknown output uses generic normalization.
- A sole known component may return `createComponent()` directly without a persistent range.
- Subscriber-based text, attr, props, branch, content and reactive collection setup returns DOM or
  ranges synchronously and schedules its work through the existing scheduler contract.
- One-shot async component, slot, plain content and direct-array work registers its continuation
  with `scheduler.waitFor()`.
- Root `render()` mounts the synchronous output and waits once for `flushInteraction()`.
- Component cleanup disposes its owner before removing mounted nodes and is idempotent.

The runtime must keep a synchronous fast path. Do not generate identity `maybeThen()` calls or
unconditional `async` functions. Use `maybeThen()` only when settlement has a real continuation.

### CSR async

- Returned Promises are supported on text, native attributes, branches, content and target-native
  structural output.
- Manual thrown Promise support is not public. Framework `AsyncSignal` suspension uses the existing
  local `retryOnPromise()` path.
- Updates are latest-started-wins. Generation is invalidated as soon as a newer attempt starts.
- Old DOM, attributes and owners remain active while replacement work is pending.
- A stale or disposed attempt cannot commit DOM, metadata, caches, subscriptions or owners.
- Promise/generation state is allocated only after a real Promise is observed.
- Component props, spreads, `innerHTML`, events, refs, keys and keyed reactive rows reject Promise
  values.

`ContentBlock` remains the one structural subscriber for reactive opaque content. Do not add
`PersistentRange`, `RenderBoundaryState`, a global Promise registry, or a second content runtime.

## Collections and `For`

There are three source categories:

```text
DirectArraySource      items.map(...)
DirectReactiveSource   source.value.map(...)
DerivedSource          derived or ambiguous reactive receiver
```

Direct arrays:

- rows are sequential and may return Promises;
- index is a plain number;
- no keyed reorder, key segment, row marker, `ForBlock`, item signal or index signal;
- row implementation is local to the owning target module, not a standalone QRL module;
- transient mounting anchors are removed when a retained parent owns cleanup.

Reactive/derived collections:

- require a synchronous `string | number` key;
- async row callbacks are rejected;
- rows execute sequentially;
- keyed reorder preserves DOM and owner identity;
- the original raw item is retained for an existing key;
- only a used row index receives a `Signal<number>` and updates after reorder;
- derived sources use `_wrapArray`; `keepSource` is used only when the index contract requires a
  Source.

The compiler provides row output shape to avoid runtime `toNodes()` and temporary arrays on known
paths. Do not reintroduce per-row wrappers or item signals.

## DOM attributes, props, bind and ref

Static attribute serialization is name-aware and shared by CSR/SSR planning:

- `null` is omitted;
- enumerated ARIA/editability attributes serialize booleans as `"true"`/`"false"`;
- ordinary `false` is omitted and ordinary `true` is a presence attribute;
- names are normalized before comparison.

`patchAttrValue()` keeps the hot dispatch order: class, value, checked, then generic attribute.
Known attribute/property names use shared constants rather than repeated strings.

Native `bind:value` and `bind:checked` are compiler-owned expansions using the existing AttrEffect
and built-in `_val`/`_chk` QRL handlers. They do not create a bind subscriber or segment. Opaque
spreads recognize bind keys inside the existing single props pass. Component `bind:*` values remain
ordinary component props.

Native `ref` is a one-shot mount operation:

- known Signal refs assign `.value` directly on CSR;
- known function refs are called directly;
- only unknown refs use the small `setRef()` helper;
- no QRL, subscriber, effect or scheduler work is created;
- SSR allocates a node ID and stores an `SsrDomRef` using the existing `RefVNode` serialization
  type;
- opaque props expose ref separately; ref is not mixed into HTML attribute serialization.

## Hooks and runtime setup

Any named `use*` import from `@qwik.dev/core` is a framework hook by binding identity. Exact built-in
semantics still belong to the relevant semantic setup plan; this avoids a brittle whitelist for
merely recognizing framework hooks.

Important supported behavior:

- `useSignal`, `useComputed$`, `useAsync$`, and `useSerializer$` use the shared Source model.
- `useConstant()` runs an untracked initializer once and owns no hook slot or subscriber.
- `useStore()` runs its factory once under `untrack()`. Default is deep/reactive; shallow uses a
  separate shallow proxy/cache; `{ reactive: false }` returns the raw object.
- `useContext`/`useContextProvider` use inherited context scopes.
- `useTask$` registers a task. Initial task ordering is registration order.
- `useVisibleTask$` records client metadata and never executes on SSR.
- `useOn`, `useOnDocument` and `useOnWindow` use the component event scope. Headless global events
  use the hidden script carrier; headless element events are ignored with a dev-only warning.
- `useId()` is compiler-replaced with a stable `_id + ordinal`; no runtime hook state is allocated.
- `useStyles$` and `useStylesScoped$` are style setup boundaries, not ordinary lazy QRL segments.
- `useServerData()` reads the request container synchronously in linear setup. The complete object
  is never serialized; only normally captured values enter state.
- `getLocale`, `setLocale` and `withLocale` are runtime utilities, not compiler hooks.

Setup-only hooks in render segments, branches, rows or resumable callbacks receive a stable
diagnostic. A conservative custom `use*` call is allowed only in linear component setup because it
may register tasks, events or styles.

## Styles

Direct style hooks receive deterministic compiler-owned IDs and registration order. Global styles
are deduplicated. Scoped styles attach the compiler-known scope statically to authored JSX.

A custom hook may register a runtime scope through `useStylesScoped(..., styleId, true)`. Runtime
scope storage is allocated only on first use and does not propagate into child component-authored
JSX. Dynamic classes go through the existing attribute/class serializer. Do not add a DOM traversal
helper to apply scopes after rendering.

## SSR model now

Current SSR is sequential:

- sibling 2 does not start before sibling 1 settles;
- rows and slot projections are sequential;
- `renderToString()` and `renderToStream()` have equivalent final semantics apart from their sink;
- returned Promises are awaited with `maybeThen()`;
- no backpatch, head transaction, reveal queue or OOOS patch is emitted.

SSR output is structured:

```ts
type SsrOutput = SsrChunk | readonly SsrOutput[];
```

It includes strings, typed references, typed event attributes and complete `SsrRecordChunk` values.
A record represents a complete start tag or marker record. The writer materializes all references
before one ordered `write()`. This does not claim TCP atomicity.

Compiler-known arrays are flattened and adjacent strings are joined before emission. A sole
dynamic step is returned directly. `maybeThen()` remains only where a prefix, suffix or later
operation must run after settlement.

`SsrOutputWriter` is the single serialized sink for HTML, state, loader/event scripts and closing
output. It permits at most one external write in flight and owns one finish path.

## SSR scheduler

The server has one `SsrScheduler` per request and currently one root lane.

- `useTaskQrl()` calls lane `notify()` synchronously.
- The first task starts eagerly while linear setup continues.
- Later tasks in a lane run sequentially in registration order.
- Compiler output flushes once after component setup, before RenderPlan execution.
- A final root flush runs before styles/state serialization.
- Synchronous task/flush paths allocate no Promise or queue.
- Visible tasks never enter the SSR scheduler.
- A lane performs no stream I/O or global metadata commit.

Lane shape is intentionally useful for future multi-head SSR, but no empty transaction/head
abstraction should be added now.

## Server bundle boundary

The server is a separate bundle, not a second stateful Qwik runtime.

Production server code imports signals, QRLs, owners, invoke context and serialization identity from
the singleton `@qwik.dev/core` module. `packages/qwik/src/server/qwik-copy.ts` is the only relative
boundary into core. It may copy/re-export only stateless constants, types and helpers whose
duplicated identity cannot affect behavior.

Do not move owners, Source classes, QRL classes, serializers or invoke state into `qwik-copy.ts`.
Unit tests may import concrete core files directly; production server modules may not.

## Public API cutover

Public root functions are source-facing:

```ts
type RenderRoot<Props = undefined> = (props: Props) => JSXOutput;

render(parent, Root, options?);
renderToString(Root, options?);
renderToStream(Root, options);
```

The compiled `(props, ctx)` ABI is internal. Renderers do not accept `<Root />`, VNodes or arbitrary
runtime JSX output. No VNode adapter or second renderer is allowed.

`@qwik.dev/core/spark` is removed. Compiler-generated runtime imports use `@qwik.dev/core`.
`@qwik.dev/core/internal` and `@qwik.dev/core/testing` intentionally remain thin target-native
subpaths. Source-level JSX types, QRL markers, `component$`, `$`, `inlinedQrl` and supported hooks
remain public.

Standalone reactive `create*` APIs are intentionally rejected rather than adapted. Infrastructure
factories such as `createTemplate`, `createComponent` and `createContextId` keep their established
roles.

## Performance rules

These rules came from measured regressions and are not stylistic preferences:

- Core runtime JS must remain minimal; do not duplicate compiler logic in runtime.
- A correct synchronous path must not allocate Promises, pending arrays, options objects,
  generations, registries or wrapper Sources.
- Prefer direct property/function operations when target planning knows the mode.
- Avoid `in` checks on collectors or generic type probing in hot paths when the planner already
  guarantees the type.
- Use `isDev` around internal assertions, duplicate-key checks and expensive diagnostics.
- Do not add a helper merely to make emitted code shorter if it increases shared downloaded JS.
- Do not add a compiler special case for one snapshot; extend a semantic or target-planning rule.
- Keep `For` and scheduler hot paths benchmarked. Historical expectations in the current local
  benchmark environment are about 2.5 ms for 1k rows and 25 ms for 10k rows; compare medians on the
  same production build/browser rather than treating those numbers as portable absolute limits.
- Any existing benchmark scenario must stay within roughly 3% median and 5% p75 unless a tradeoff
  is explicitly accepted.

## Deliberately unsupported or deferred

Do not implement these opportunistically:

- `useResource`;
- ErrorBoundary (the intended implementation is expected to change);
- Suspense and SuspenseList;
- multi-head SSR;
- OOOS structural/attribute backpatch execution;
- SSR head transactions, reveal patches and state-delta remapping;
- retry of an entire RenderPlan;
- manually thrown user Promises as a public async contract;
- async reactive/derived keyed `For` rows;
- Promise component props, spreads, `innerHTML`, event handlers, refs and keys;
- component rerendering as an update mechanism;
- VNode tree inspection or compatibility runtime.

Future OOOS/backpatch work must follow [`MULTI_HEAD_SSR.md`](./MULTI_HEAD_SSR.md): structural
patches use compiler boundaries, attribute patches use stable element IDs, work renders into a
local serialization context, commit remaps/deduplicates roots and dependencies, and every payload
uses the one ordered sink. Do not leak SSR-only state into CSR invoke contexts.

## Testing policy

- Use focused Vitest files; never run `pnpm test.unit`.
- Update snapshots only for named fixtures and inspect every semantic diff.
- Never use a bulk `-u` snapshot update.
- A snapshot is evidence, not the architecture. Suspicious extra runtime work should be fixed at
  semantic lowering or target planning rather than accepted.
- Tests constructing subscribers directly need an owner or the compiler-backed test harness.
- Legacy test disposition is recorded in
  `packages/qwik/src/core/tests/LEGACY_TEST_MIGRATION.md`.
- Full component-rerender and VNode-tree assertions are deliberately excluded; DOM, serdes, resume,
  events, signals, stores, tasks, styles, context, slots, collections and render APIs remain
  covered.

Useful commands:

```text
pnpm vitest run packages/compiler/src
pnpm vitest run packages/qwik/src/core
pnpm vitest run packages/qwik/src/server
pnpm vitest run packages/qwik/src/testing
pnpm build.compiler
pnpm build.core.dev
pnpm tsc.check
pnpm api.update when public exports or documented source locations changed
git diff HEAD --check
```

When the root pnpm signature verifier blocks local wrapper commands, do not bypass it with
`pmOnFail=ignore`. Use the equivalent checked-in Node build entry or local binary for diagnosis and
report the environmental blocker. Building platform bindings also requires the local `napi` CLI.

## Current verification baseline

After flattening the core and server source directories:

- Qwik package TypeScript check passes.
- Core/server/testing: 62 passing files plus one skipped file; 817 passing tests and four skipped.
- Server after relocation: six files and 33 tests pass.
- Compiler plus the focused Qwik Vite plugin test: 17 files and 353 tests pass.
- Targeted Qwik/core/worker build passes.
- Prettier checks for the merged entrypoints and relocated server files pass.
- `git diff HEAD --check` passes.

These counts are a historical handoff baseline, not a substitute for rerunning affected tests.

## Current worktree cautions

The worktree contains a large, intentional cutover diff that predates the final directory
flattening. Preserve it. Do not use `git reset`, `git checkout`, or broad generated-file updates.
Always inspect `git diff HEAD`, not only the unstaged diff.

At the time of this handoff, relocated destination files under `packages/qwik/src/core/*` and
`packages/qwik/src/server/ssr-*.ts` are untracked while their former locations are deleted in the
working tree. A future intentional staging operation must use `git add -A`; `git add -u` would omit
the destinations. Do not stage unless the user asks.

Generated API documentation under `packages/docs/src/routes/api` still contains old source edit
links from before directory flattening. Regenerate it with `pnpm api.update`; do not hand-edit the
generated Markdown/JSON.

## Decision protocol

When a new edge case is not settled in `PLAN.md`:

1. identify the semantic layer that owns the decision;
2. show the smallest representative TSX input and CSR/SSR output;
3. explain runtime-size, performance, resumability and serialization consequences;
4. stop and ask for the intended behavior;
5. update `PLAN.md` before implementing the chosen contract.

Never improvise by adding a runtime fallback, compatibility adapter, generic normalization or
silent pass-through to the removed pipeline.
