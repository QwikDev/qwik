# JSX implementation checklist

## Goal and scope

Replace the legacy compiler with the staged pipeline and pass the relevant core unit tests and
e2e tests, including behavioral coverage ported from `main`. Exclude tests of VDOM structure;
preserve their observable DOM, state, event and cleanup regressions where applicable.

This is the agreed implementation order. Each numbered group shares implementation concerns;
it is not a single PR. Deliver small, reviewable increments within each group. Discuss changes
to the order or scope explicitly rather than silently replacing this roadmap.

Start each behavior change with focused tests and CSR/SSR snapshots where appropriate. Reuse
existing analysis facts, lowering and runtime helpers. Keep shared facts in their owning phase
and framework-specific decisions in their consumers. Do not add parallel implementations for
the same JSX shape in components, projections and collection rows.

Update this checklist after each increment. Check an item only when its behavior is verified,
and record the relevant test or commit. Compilation success alone does not prove correct output
or browser resume. Open items include missing implementation and existing behavior that still
needs integration or regression proof.

Rust/native backends and event-only qwikloader optimization are outside this checklist.

## Audit baseline — 2026-09-08

The audit included the working tree based on `42eaacb18` (including uncommitted module-binding
QRL support), local `main` at `61a2eda91`, current core tests and e2e application sources.

- Pipeline tests: 719 passed, 16 TODO.
- Current core tests after a fresh build: 42 suites failed during loading/transformation;
  one executed test failed. Vitest reported 43 failed files, 7 passed, 1 skipped across projects.
- Direct SSR compilation of 431 JSX/TSX files under `e2e`: 103 rejected. The remaining files
  were not proven correct; some output still contained untransformed `$` boundaries.
- No full Playwright run or execution of the ported `main` corpus was performed in this audit.
- Estimated functional completion: approximately **55%, with ±10 percentage points uncertainty**.
  This is a planning estimate, not a test-pass ratio or an estimate of remaining effort.

Existing foundations include the binding/reference graph, generic ESM linker, QRL chunks and
captures, component props and spreads, basic events, branches, collections, projections and slots.

## 0. Unblock the current test harness

- [x] Resolve generated chunks in the CSR project (`Cannot find module` failures).
- [x] Eliminate collisions between retained authored imports and generated imports, including
      duplicate `useSignal` bindings.
- [x] Preserve shared bindings when extracting render roots from test-local scopes.
- [x] Verify the same fixtures in CSR and resume, not only generated-source snapshots.

Verified by `test-resume.unit.ts`, `analysis.unit.ts`, `import-references.unit.ts` and
`compiler-harness.spec.tsx` in both CSR and resume projects.

Relevant code: `packages/qwik-vite/src/plugins/test-resume.ts`, render-root extraction and
`generate/assemble-module.ts` / `generate/emit-import.ts`.

## 1. Ordinary code in component bodies

- [x] Support ordinary statements before rendering: calls, assignments, `if`, blocks, `throw`
      and `try`.
- [x] Preserve native `let`/`var` declarations and mutations within component setup. Keep the
      existing value-capture contract across `$` and reject writes to captured bindings.
- [x] Support local function and component declarations.
- [x] Support early and multiple returns, including `null`, `undefined` and bare `return`.
- [x] Handle bodies ending entirely in conditional returns or exceptions.
- [x] Handle multiple declarators in a declaration containing a component.
- [x] Allow ordinary core calls such as `createContextId()` and `getLocale()` in setup without
      requiring them to be recognized hook contracts.

Keep authored JavaScript as JavaScript; transform the relevant boundaries rather than building
another implementation of the JavaScript language in Core IR.

Relevant code: `analyse/discover.ts`, `analyse/lower-setup.ts`, binding/reference analysis.

Verified by `component-body.unit.ts`, `lower-setup.unit.ts`, the
`ordinary-component-body` CSR/SSR snapshots, and `component-body.spec.tsx` in both CSR and
resume projects. Native helper calls in setup, local components, empty results, exceptions,
block scope, var hoisting, native mutation and explicit shared object captures are covered.
Mutable QRL event bindings, reassignment and null handlers are verified in CSR and resume.
Function-reference QRL extraction remains tracked in group 6; for-loop setup remains unsupported.

QRLs capture initialized values at creation; later local reassignment does not update those
captures. Shared mutable state uses object, store or signal properties. Assignment, update,
destructuring and loop-target writes through `$` are diagnosed; local callback writes remain valid.

## 2. JSX as a value — one shared mechanism

- [x] JSX initializers: `const content = <div />`.
- [x] JSX in arrays, objects and nested structures.
- [x] JSX call arguments: `wrap(<Child />)`, `render(<App />)`.
- [x] JSX-valued props: `fallback={<Loading />}`.
- [x] JSX-returning props and children: render props, `onResolved` callbacks and factories.
- [x] JSX inside `$`, event handlers, hooks and ordinary callbacks.
- [x] JSX inside `.then()`, `Promise.resolve()` and async functions.
- [x] JSX outside top-level components: helpers, factories and local functions.
- [x] Repeated use of a stored JSX value with correct instance ownership and cleanup.
- [x] Explicit `<Fragment>` and imported aliases, not only `<>`.

Relevant code: `analyse/ast/jsx-analysis.ts`, `analyse/ast/returns-jsx.ts`,
`analyse/lower-expr.ts`, `analyse/lower-function.ts` and shared render lowering.

Verified by `jsx-value.unit.ts`, `jsx-analysis.unit.ts`, the `jsx-value` CSR/SSR snapshots,
and `jsx-value.spec.tsx` in CSR and resume. Direct element/fragment initializers work with
`const`, `let` and `var`, aliases, block scope, and collection rows. Each use has its own content
range; hiding one instance disposes its subscriptions without affecting its sibling.
Local component targets captured by a JSX value remain unsupported and are diagnosed explicitly;
module-level component targets work.

Arrays and nested objects preserve native construction, spreads, computed keys and destructuring.
Verified by `jsx-value.unit.ts`, `jsx-analysis.unit.ts`, the `jsx-structures` CSR/SSR snapshots,
and `jsx-value.spec.tsx` in CSR and resume. Coverage includes reactive member selection, events,
repeated instance cleanup, mixed escaped text and single evaluation of keys and spread getters.
`content.unit.ts` verifies ordering when nested JSX QRL imports resolve out of order.
Direct sparse arrays render empty entries; capturing sparse arrays remains unsupported by serialization.

Call arguments share the same JSX lowering in component setup and render expressions, including
nested calls, spreads, optional calls, branch conditions and collection rows. Native calls preserve
their receiver, argument order and single evaluation. Verified by `jsx-call.unit.ts`, the `jsx-call`
CSR/SSR snapshots and `jsx-value.spec.tsx` in CSR and resume, including component instances,
event captures, reactive result replacement and escaped primitive results. Calls inside helpers
use the same mechanism described below.

Constructor arguments and setup assignments share the same scoped JSX root discovery as callbacks.
Assigned values, including aliases and destructuring, use binding analysis for render classification.
Verified by `bindings.unit.ts`, `jsx-call.unit.ts`, `jsx-value.unit.ts`, the `jsx-assignment`
CSR/SSR snapshots, and `jsx-value.spec.tsx` in CSR and resume.

JSX-valued props compile to render values, including alongside reactive spreads and inside inline
collection rows. Verified by `jsx-prop.unit.ts` and new CSR/SSR snapshots. Classification of values
read by the receiving component belongs to group 3 below.

Inline JSX factories in component props and function children preserve their parameters, local
statements and per-call captures. Function children are passed as the callable `children` prop.
Verified by `jsx-factory-prop.unit.ts`, new CSR/SSR snapshots and `jsx-factory-prop.spec.tsx` in CSR
and resume. Existing prop readers and ordinary projections retain their output. Module and local
helper factories share the same lowering described below.

JSX inside `$`, event handlers, hooks and ordinary callbacks shares scoped expression lowering.
Native callbacks retain synchronous calls, parameters, receiver, local statements and mutations;
only their embedded JSX becomes captured render values. Verified by `jsx-callback.unit.ts`, new
CSR/SSR snapshots and `jsx-callback.spec.tsx` in CSR and resume. Existing valid snapshots are unchanged.
Rendering unknown callback results remains a separate checklist item.

Direct `this` and `arguments` reads inside JSX retain their native function owner, including
lexical arrows and parameter defaults. Argument values cross QRL boundaries as serializable
snapshots and restore native argument objects. Verified by `bindings.unit.ts`, `jsx-helper.unit.ts`,
`jsx-callback.unit.ts`, `jsx-factory-prop.unit.ts`, the `jsx-function-context` CSR/SSR snapshots,
and `jsx-helper.spec.tsx` in CSR and resume.

`Promise.resolve`, `.then()` callbacks and async factories preserve Promise ordering, rejection
identity and per-call JSX captures. Nested async JSX callbacks inside QRLs reuse `_await` to restore
tracking after suspension. Verified by `jsx-async.unit.ts`, new CSR/SSR snapshots and
`jsx-async.spec.tsx` in CSR and resume, including rejection, `catch` and `finally`. Async components
and classification of arbitrary Promise render results remain outside this item.

Module helpers, factories and local function declarations retain native calls, exports, hoisting
and per-invocation captures. Their embedded JSX shares function payload lowering, including modules
without components. Verified by `jsx-helper.unit.ts`, new CSR/SSR snapshots and `jsx-helper.spec.tsx`
in CSR and resume, including captured events, early calls, parameter defaults and SSR escaping.
Existing valid snapshots are unchanged.

Explicit `Fragment` imports from `@qwik.dev/core`, including aliases, share shorthand fragment
analysis and lowering. Projections, stored values, helpers and keyed collection rows preserve their
existing behavior. Other fragment attributes are diagnosed explicitly. Verified by
`jsx-fragment.unit.ts`, new CSR/SSR snapshots and `jsx-fragment.spec.tsx` in CSR and resume,
including keyed instance reuse and captured events after reordering. Existing snapshots are unchanged.

## 3. Dynamic render results

- [x] Distinguish text from renderable JSX values instead of routing every unknown expression
      through a text hole.
- [ ] Render nested child arrays, mixed text/elements and empty values.
- [ ] Support transitions between text, elements, arrays and empty output.
- [ ] Render JSX results supplied by functions, promises, signals and stores.
- [ ] Support direct signal children if retaining that API contract from `main`.
- [x] Render dynamic text as the complete component result in SSR without the
      `a root text hole outside a range` rejection.
- [ ] Handle `||`, `??` and sequence expressions containing JSX while preserving short-circuit
      behavior and single evaluation.

Reuse `ContentBlock` and dynamic-content helpers in `packages/qwik/src/core/dom/content/`;
complete their contract rather than introducing a parallel renderer.

Prop-dependent holes are resolved at application link time, including imported neutral library
plans. Proven text retains text effects; mixed or unresolved values use existing content ranges.
See [Linked render results](./LINKED-RENDER-RESULTS.md) for the artifact contract, verification,
snapshot audit and remaining production-build blockers.

## 4. Component targets and factories

- [ ] Member tags: `<UI.Button />`, `<props.component />`.
- [ ] String-valued dynamic tags: `const Tag = props.as; <Tag />`.
- [ ] Function- and QRL-valued dynamic tags.
- [ ] Reactive target changes with props, projections and cleanup of the previous instance.
- [ ] Components returned by factories and wrappers.
- [ ] `component$(existingFunction)` and `componentQrl` where retaining these API paths.

Reuse existing dynamic-tag runtime helpers. A generated `createComponent(Tag, ...)` call does
not by itself support a string-valued tag.

## 5. Parameters, aliases and destructuring

Simple props, aliases, rest and some defaults are already implemented. Complete:

- [ ] Nested parameter patterns.
- [ ] Computed keys.
- [ ] Defaults referencing earlier parameters, such as `{ a, b = a }`.
- [ ] Default-expression name collisions with setup declarations.
- [ ] Correct read/default/side-effect evaluation order.
- [ ] Distinction between ordinary JavaScript snapshots and aliases that remain reactive under
      the framework contract.
- [ ] Destructured store aliases after source replacement; the current resume test fails here.

Share binding facts across component parameters, callbacks and collection rows.

## 6. `$` boundaries throughout the module

Direct setup hooks and individual callbacks already work. Complete location-independent boundary
transformation:

- [ ] Module-level `$()` and boundaries inside ordinary functions.
- [ ] Nested `$()` inside other QRLs.
- [ ] Custom `foo$`, `factory$` and user hooks outside direct component setup.
- [ ] Existing function references instead of inline callbacks.
- [ ] Non-function QRL values: strings, objects and imported values.
- [x] `useStyles$('...')` and `useStylesScoped$(css)` lower to the `Style` op and call
      `useStyles`/`useStylesScoped` with a compile-time id in both environments; object-form
      `useSerializer$` arguments ship as factory QRLs with their captures.
- [ ] Non-event prop boundaries such as `fallback$`, `render$` and `then$`.
- [ ] Correct captures and imports at every nested boundary.
- [ ] Preserve the existing `await` transformation in newly supported locations.

Leaving `$()` or `routeLoader$()` untouched is not successful QRL extraction.

## 7. DOM props and spreads

Component spreads already exist. Complete element spreads and DOM semantics:

- [ ] `<div {...props}>`, multiple spreads and interleaving with explicit attributes.
- [ ] Override order and single evaluation.
- [ ] Addition/removal of keys in reactive spreads.
- [ ] Events, refs, bindings and HTML supplied through spreads.
- [ ] Static/dynamic parity for boolean/enumerated attributes, `aria-*` and `data-*`.
- [ ] Native DOM properties where required, especially `value`, `checked` and `selected`.
- [ ] `<textarea>` and `<select>` semantics.
- [ ] Class/style combinations: arrays, objects, signals, removal and overrides.

Reuse the rules in `packages/qwik/src/core/dom/effect/dom-props.ts` for both spread and
non-spread paths.

## 8. Events, bindings and refs

Share prop classification; deliver the following in small increments.

### Events

- [ ] `document:on*$` and `window:on*$`.
- [ ] `preventdefault:*`, `stoppropagation:*`, `passive:*` and `capture:*`.
- [ ] Inline handler arrays: extraction, captures, ordering and ignored empty entries.
- [ ] Handler arrays forwarded through components and spreads.
- [ ] `sync$` emission and synchronous-handler registration.
- [ ] Merge JSX listeners with `useOn*` without losing modifiers or duplicating registration.

### Bindings and refs

- [ ] `bind:value` and `bind:checked`, including forwarding through props and spreads.
- [ ] Merge generated binding listeners with authored handlers.
- [ ] Signal, callback, forwarded and conditional refs.
- [ ] SSR references, resume and ref/task ordering.

## 9. HTML, namespaces and template correctness

- [ ] Emit `dangerouslySetInnerHTML` as element content, not an attribute.
- [ ] Preserve its subtree when unrelated props change.
- [ ] Correct text treatment in `script`, `style`, `textarea` and `title`.
- [ ] SVG/MathML namespaces and `foreignObject` transitions.
- [ ] `xlink:href` and `xml:lang`.
- [ ] Separately created SVG nodes in branches, collections, slots and dynamic tags.
- [ ] HTML parser context for `table`, `tbody`, `tr`, `td`, `select` and `option`.
- [ ] Correct locators after browser HTML normalization.
- [ ] `q:shadowRoot` and container boundaries exercised by e2e.

Verify the escaping boundary between text/attributes and explicit raw HTML, including script
delimiters. Compilation snapshots alone cannot prove browser parser behavior.

## 10. Complete collection coverage

`.map`, keys, captures, destructuring and conditional rows already have substantial coverage.

- [ ] Derived collections without a key, currently rejected in existing e2e sources.
- [ ] Function-expression and referenced callbacks, not only inline arrows.
- [ ] Richer callback bodies using the shared mechanism from group 1.
- [ ] Async rows and dynamically shaped results.
- [ ] Inline-row attribute/prop emission; current tests hit `a non-QRL computed prop`.
- [ ] Row-shape changes and mixed keyed/unkeyed cases required by ported tests.
- [ ] Adapt `<Each>` and `<Show>` to existing collection/branch operations if retaining their
      APIs from `main`.

Verify reorder, replacement, event captures and cleanup after resume, not only output snapshots.

## 11. Complete projection and slot coverage

Already implemented: default/named slots, fallback, forwarding, fragments, conditional projections
and dynamic `Slot name`.

- [ ] Dynamic projection assignment: `q:slot={expression}`, distinct from a dynamic consumer.
- [ ] JSX/children supplied as values and through props spreads.
- [ ] Defaults for destructured `children`.
- [ ] An explicit user-code `children` contract instead of emitting invalid reads such as
      `props.children.length`.
- [ ] Port behavioral regressions: initially absent slots, repeated hide/restore, author-side
      changes and independent cleanup.
- [ ] Combine slots with dynamic content, namespaces, async and error boundaries.
- [ ] External projections needed by React integration, including runtime/integration work.

Do not restore serialization of a children tree merely to reproduce old VNode operations.

## 12. Styles, context and hooks across new boundaries

- [x] Connect `useStyles$` and `useStylesScoped$` to the `Style` op; styles never become QRLs.
- [x] Propagate scoped classes onto the component's elements: static classes fold at lowering,
      dynamic classes pass the scope to their attribute effect. Scopes a custom hook registers at
      runtime are not applied yet (`runtimeScope` stays false).
- [x] Preserve authored style scope across branches, collections, projections and dynamic content.
      Elements lowered under the author's component carry its scope wherever they render.
- [x] Multiple scoped styles and deduplication: scopes join into one class list; the runtime
      dedupes `q:style` by id.
- [x] Serialize the provided context scope in SSR: components calling `useContextProvider` wrap
      their output in `<!c=…>`/`<!/c>` markers so branches, rows and projections resumed later
      find the scope. Custom hooks that provide context internally are not yet detected.
- [ ] Preserve context/owner across every newly supported rendering callback.
- [x] Register `useVisibleTask$` in SSR as a client wake event (`qvisible`, or `qinit`/`qidle`
      for the document strategies) instead of calling the hook on the server.
- [x] Defer a component's render until its initial tasks settle: SSR awaits the lane, CSR awaits
      the invoke context's initial task chain, and custom hooks count as possible task starters.
- [ ] Verify `useId`, `useOn*`, tasks and cleanup for headless components and new root shapes.

Much of the hook runtime already exists; complete compiler output and scope propagation rather
than reimplementing each hook.

## 13. Async rendering, Suspense and Reveal

- [ ] Async components.
- [ ] Promises returning JSX or child arrays.
- [ ] Thrown-promise retry without duplicate initialization or projection.
- [ ] Lower `<Suspense>` and `<Reveal>` markers to existing runtime mechanisms.
- [ ] Fallback QRLs, delay, nested boundaries and preservation of previous content.
- [ ] Reveal ordering and cancellation of stale results.
- [ ] Out-of-order streaming and state shared across segments.
- [ ] Resume segments whose content arrives after the shell.

## 14. Remaining rendering contracts from `main`

These are not all JSX syntax features, but they are required for the overall test goal.

- [ ] Resource pending/resolved/rejected results and rendering callbacks.
- [ ] Error boundaries: fallback, reset, escalation, render/task/event errors and sibling survival.
- [ ] `SSRRaw`, `SSRComment`, `SSRStream`, `SSRStreamBlock`, generators and writer callbacks.
- [ ] Streaming/backpatching order, errors, shared state and late refs.
- [ ] Embedded/multiple containers with independent resume.
- [ ] React integration paths still using removed projection mechanisms.
- [ ] Explicitly reconcile tests relying on semantics intentionally changed in v3, including
      component re-execution, remount through `key` and `SkipRender`, before porting expectations.

Removing VDOM-structure assertions alone does not adapt an old behavioral contract to v3.

## 15. Switch real builds to the pipeline

- [ ] Use the pipeline in production Vite, not only the unit harness.
- [ ] Transform library modules and custom `$` APIs.
- [ ] Specialize `isServer`, `isBrowser` and `isDev` everywhere they occur.
- [ ] Apply stripping policies and exclude server-only code.
- [ ] Verify manifests, chunk graphs, exports, dynamic imports and QRL identity in real builds.
- [ ] Dev/HMR and invalidation of dependent modules.
- [ ] Cold browser resume with genuinely unloaded chunks.
- [ ] Finish porting behavioral tests from `main` and run the complete relevant unit/e2e corpus.

## Deferred proposal — shared mutable lexical captures

Automatic shared capture cells are a possible future extension, outside group 1's current
contract. They could preserve one mutable lexical binding across extracted QRLs without requiring
an explicit object or signal. Allocate cells only for bindings that need shared mutation; keep
ordinary component code as native JavaScript.

The explored approach used serializable objects with accessors forwarding to native bindings.
Before adopting it, resolve initialization and TDZ behavior, var hoisting, block/loop instance
lifetimes, and capture validation that must not read bindings before initialization. Verify
shared identity through SSR serialization and resume, including cold chunks, and assess generated
code size and runtime cost. The previous implementation is not the accepted default contract.

## Progress updates

Keep the dated baseline above as historical evidence. Add verified increments here and update
their checkboxes; do not silently reinterpret the original completion estimate as a live metric.

- 2026-09-12: Scoped classes: lowering tracks the component's `⚡️<id>` scopes and rewrites each
  element's static `class` (or adds one) while `styleScopedId` reaches the dynamic class effects
  on both targets. Verification: 1027 pipeline tests (16 existing TODOs), the extended
  `setup-styles` snapshots, and `use-styles-scoped.spec.tsx` green in CSR and resume. Core spec
  corpus: CSR 17 → 4 failed, resume 15 → 3 failed; `use-serialized` "used many times" is flaky
  in resume and passes on rerun.

- 2026-09-12: `useStyles$`/`useStylesScoped$` lower to `SetupKind.Style` with a module-stable
  `styleId` and emit `useStyles(css, id)` / `useStylesScoped(css, id, true)` on both targets;
  literal css inlines, other arguments print as authored. `useSerializer$` is a core operation
  whose object argument ships as a factory QRL with captures. Verification: 1027 pipeline tests
  (16 existing TODOs), the `setup-styles` and `setup-serializer` CSR/SSR snapshots, and
  `use-styles.spec.tsx`/`use-serialized.spec.tsx` green in CSR and resume. `use-styles-scoped`
  now compiles; its 13 remaining failures need scoped class propagation (group 12).

- 2026-09-11: Runtime: `serializeSsrEvent` now wraps a handler in `_run` whenever the caller
  needs an invoke context, not only when the QRL moved captures, so capture-less handlers in a
  localized container can read `getLocale()` after resume. The pipeline exposed this because it
  imports module bindings instead of capturing them. Verification: `ssr-event-attr.unit.ts` and
  `use-locale.spec.tsx` in resume. Core spec corpus: resume 3 → 2 failed, CSR unchanged at 4.

- 2026-09-11: SSR output of a component that calls `useContextProvider` records
  `ctx.contextScopeRef()` and wraps its markup in `<!c=…>`/`<!/c>`, the marker pair the resume
  side already reads through `getContextScopeForNode`. Verification: 1023 pipeline tests
  (16 existing TODOs), the `setup-context` SSR snapshot, and `context.spec.tsx`/`slot.spec.tsx`
  in resume. Core spec corpus: resume 9 → 3 failed, CSR unchanged at 4.

- 2026-09-11: Setup calls to `$` hooks follow the Rust optimizer's marker rule: core hooks lower
  to typed core operations that each generator names itself; a named custom `$` import from any
  source, or an exported same-file `$` binding, calls its `Qrl` twin on the server and its
  function twin on the client. The linker resolves the twins from the hook's own source into the
  plan (`missing-hook-twin` when absent), so generators only print them. Client callbacks ship statically with their captures instead of a chunk; a QRL
  held in a binding keeps the `Qrl` twin. Components whose setup calls `useTask$` or any
  non-core hook render inside `maybeThen(<pending work>, () => invoke(ctx, ...))`: SSR waits on
  `ctx.scheduler.flush()`, CSR on the invoke context's `pendingSetup`, which `useTask` chains.
  Verification: 1023 pipeline tests (16 existing TODOs), the `setup-marker-hooks` and
  `setup-task-wait` CSR/SSR snapshots, and `task.spec.tsx` green in CSR and resume. Core spec
  corpus: CSR 8 → 4 failed, resume 14 → 9 failed. Compiler unit harnesses that call a compiled
  render directly pass `setupOnlyContext` from `fixtures.ts` for the lane flush.

- 2026-09-11: SSR output registers `useVisibleTask$` through `useOn`/`useOnDocument` with
  `createVisibleTaskHandlerQrl`, mapping the `strategy` option to `qvisible`, `qinit` or `qidle`;
  CSR keeps the authored call. Dynamic strategies are diagnosed. Verification: 1017 pipeline
  tests (16 existing TODOs), the `setup-visible-task` CSR/SSR snapshots, and `task.spec.tsx` in
  resume. Core spec corpus: CSR unchanged at 8 failed, resume 19 → 14 failed; the remaining
  resume task failures involve `await` inside `useTask$`.

- 2026-09-11: Component props that pass a setup local as-is (`count={count}`) compile to plain
  entries instead of an identity prop QRL chunk. The chunk added a lazy import and suspended
  reads outside retrying contexts, which broke task cleanup writes through props once capture
  validation stopped evaluating prop getters. Consumer mutations now contribute their written
  value kinds, so a scalar write through a prop keeps the parent's text effect instead of a
  content block. Verification: 1015 pipeline tests (16 existing TODOs), new
  `component-binding-prop` CSR/SSR snapshots, and `task.spec.tsx`/`component.spec.tsx` in CSR
  and resume. Core spec corpus after a fresh dev build: CSR 8 failed / 136 passed, resume
  19 failed / 136 passed; the remaining failures predate this change.

- 2026-09-11: Replaced partial TypeScript syntax interpretation with declared-contract queries
  through the TypeScript checker. Named, generic and imported types resolve before generation;
  the default build collects type-only dependencies without emitting their runtime code.
  Neutral module and linked plans use version 3. Existing snapshots remain unchanged.
  Verification: 1141 tests pass (16 existing TODOs), including CSR/resume and real build-host
  tests. Compiler build, compiler/plugin type checks, ESLint and formatting pass.

- 2026-09-09: Added linked render-result analysis, neutral library artifacts and application-wide
  linking in the default build host. Known text retains text effects; unresolved or mixed holes
  use existing content operations. Verification: 985 pipeline tests, 8 real build-host tests,
  plugin tests, content/serialization unit tests and CSR/resume integration tests pass (1112 tests
  in total, 16 existing TODOs). Compiler build, compiler/plugin types, ESLint and formatting pass.
  Typed examples preserve their original executable CSR/SSR output across 48 snapshots; only
  inputs and source locations change. See `LINKED-RENDER-RESULTS.md` for the contract audit.
  The full core/Router build remains blocked by unsupported Router constructs; group 15 is
  incomplete. No cold-browser e2e run was performed.

- 2026-09-08: Completed group 1's statement, declaration and return support. Authored control
  flow remains JavaScript, with setup and render replacements recorded in source payloads.
  Mutable locals share serializable cells across extracted callbacks. Verification: 743 passing
  pipeline tests (16 existing TODOs), CSR/SSR snapshots, and 10 passing CSR/resume tests across
  `component-body.spec.tsx` and `compiler-harness.spec.tsx`. The focused compiler build and
  `tsc --noEmit` pass. Early-return text escaping is covered by an SSR regression.
- 2026-09-08: Fixed block-local mutation reads and QRL captures preceding `let` declarations.
  Capture cells retain native bindings and become enumerable after initialization, preserving
  dev capture validation and serialization. Verification: 747 passing pipeline tests (16 existing
  TODOs), updated CSR/SSR snapshots, and 16 passing CSR/resume tests across
  `component-body.spec.tsx` and `compiler-harness.spec.tsx`. Compiler build and type checks pass.
- 2026-09-08: Clarified group 1 to retain Qwik's existing value-capture contract. Removed automatic
  capture cells, preserved native declarations and setup mutations, and added compiler diagnostics
  for writes to captured bindings. ESLint now also catches updates, destructuring and loop targets.
  The earlier capture-cell implementation is superseded; its design is recorded above for later.
  Verification: 758 pipeline tests, 16 CSR/resume tests and 75 ESLint tests pass (849 total, plus
  16 existing TODOs); compiler build, type checks and updated CSR/SSR snapshots pass.
- 2026-09-08: Fixed dynamic event output in SSR by emitting event attributes inside markup records.
  `createSsrMarkup` omits null parts, so event emission needs no separate null check.
  The mutable-handler regression covers the initial QRL, reassignment, null and repeated clicks in
  CSR and resume. Verification: 928 tests pass across the pipeline, component/harness, ESLint,
  SSR writer, SSR effects, event attributes, server rendering and script emission (16 existing TODOs).
  Core/compiler builds, type generation, runtime/compiler ESLint and CSR/SSR snapshots pass.
  The script-emitter test retains five pre-existing lint errors outside the changed expectation.

- 2026-09-08: Added stored JSX values using shared render QRLs and content ranges, including aliases,
  fragments, mutable declarations and collection-row setup. Verified independent instances,
  replacement, cleanup, event captures and reactive text in CSR and resume. Dynamic slots now use
  the same content operation. SSR forwards the container context and escapes primitive values;
  generated render context names avoid authored bindings. Local component captures are diagnosed.
  Verification: 860 tests pass across 44 suites (16 existing TODOs), including CSR/resume and
  SSR escaping; compiler type checks, ESLint, formatting and CSR/SSR snapshots pass. Core and
  compiler dev builds complete; the core declaration pass reports two existing TS7006 errors in
  `packages/qwik-vite/src/plugins/plugin.ts`. No Playwright run was performed for this increment.
- 2026-09-08: Added JSX in arrays and nested objects through shared expression payloads and
  render QRLs. Native spreads, computed keys, destructuring and evaluation order are preserved.
  Dynamic content recursively renders arrays, retaining order across delayed imports and escaping
  primitive text in SSR. Verification: 883 tests pass across 44 suites (16 existing TODOs), including
  CSR/resume cleanup and reactive member selection; compiler types, ESLint and formatting pass.
  CSR/SSR snapshots cover the new structures. The core dev build completes with the same two
  existing TS7006 declaration errors in `packages/qwik-vite/src/plugins/plugin.ts`.
- 2026-09-08: Added JSX call arguments in component setup, return values, children and collection
  rows through shared expression payloads. Calls retain native receivers, ordering, spreads and
  optional evaluation. Static SSR collections now resolve asynchronous row output before emitting
  their enclosing markup. Verification: 912 tests pass across 45 suites (16 existing TODOs),
  including CSR/resume event captures, independent component replacement and SSR escaping.
  Compiler dev build, compiler types, ESLint, formatting and CSR/SSR snapshots pass. The core dev
  build completes with the same two existing TS7006 declaration errors in `qwik-vite`.
