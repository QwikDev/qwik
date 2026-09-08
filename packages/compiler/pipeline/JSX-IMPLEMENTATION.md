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

- [ ] Resolve generated chunks in the CSR project (`Cannot find module` failures).
- [ ] Eliminate collisions between retained authored imports and generated imports, including
      duplicate `useSignal` bindings.
- [ ] Preserve shared bindings when extracting render roots from test-local scopes.
- [ ] Verify the same fixtures in CSR and resume, not only generated-source snapshots.

Relevant code: `packages/qwik-vite/src/plugins/test-resume.ts`, render-root extraction and
`generate/assemble-module.ts` / `generate/emit-import.ts`.

## 1. Ordinary code in component bodies

- [ ] Support ordinary statements before rendering: calls, assignments, `if`, blocks, `throw`
      and `try`.
- [ ] Support `let`/`var` and local mutations with correct capture semantics, not automatic
      conversion to snapshots.
- [ ] Support local function and component declarations.
- [ ] Support early and multiple returns, including `null`, `undefined` and bare `return`.
- [ ] Handle bodies ending entirely in conditional returns or exceptions.
- [ ] Handle multiple declarators in a declaration containing a component.
- [ ] Allow ordinary core calls such as `createContextId()` and `getLocale()` in setup without
      requiring them to be recognized hook contracts.

Keep authored JavaScript as JavaScript; transform the relevant boundaries rather than building
another implementation of the JavaScript language in Core IR.

Relevant code: `analyse/discover.ts`, `analyse/lower-setup.ts`, binding/reference analysis.

## 2. JSX as a value — one shared mechanism

- [ ] JSX initializers: `const content = <div />`.
- [ ] JSX in arrays, objects and nested structures.
- [ ] JSX call arguments: `wrap(<Child />)`, `render(<App />)`.
- [ ] JSX-valued props: `fallback={<Loading />}`.
- [ ] JSX-returning props and children: render props, `onResolved` callbacks and factories.
- [ ] JSX inside `$`, event handlers, hooks and ordinary callbacks.
- [ ] JSX inside `.then()`, `Promise.resolve()` and async functions.
- [ ] JSX outside top-level components: helpers, factories and local functions.
- [ ] Repeated use of a stored JSX value with correct instance ownership and cleanup.
- [ ] Explicit `<Fragment>` and imported aliases, not only `<>`.

Relevant code: `analyse/ast/jsx-analysis.ts`, `analyse/ast/returns-jsx.ts`,
`analyse/lower-expr.ts`, `analyse/lower-function.ts` and shared render lowering.

## 3. Dynamic render results

- [ ] Distinguish text from renderable JSX values instead of routing every unknown expression
      through a text hole.
- [ ] Render nested child arrays, mixed text/elements and empty values.
- [ ] Support transitions between text, elements, arrays and empty output.
- [ ] Render JSX results supplied by functions, promises, signals and stores.
- [ ] Support direct signal children if retaining that API contract from `main`.
- [ ] Render dynamic text as the complete component result in SSR without the
      `a root text hole outside a range` rejection.
- [ ] Handle `||`, `??` and sequence expressions containing JSX while preserving short-circuit
      behavior and single evaluation.

Reuse `ContentBlock` and dynamic-content helpers in `packages/qwik/src/core/dom/content/`;
complete their contract rather than introducing a parallel renderer.

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
- [ ] `useStyles$('...')`, `useStylesScoped$(css)` and object-form `useSerializer$` arguments.
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

- [ ] Connect value QRLs from group 6 to `useStyles$` and `useStylesScoped$`.
- [ ] Assign scoped IDs and propagate scoped classes.
- [ ] Preserve authored style scope across branches, collections, projections and dynamic content.
- [ ] Multiple scoped styles and deduplication.
- [ ] Preserve context/owner across every newly supported rendering callback.
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

## Progress updates

Keep the dated baseline above as historical evidence. Add verified increments here and update
their checkboxes; do not silently reinterpret the original completion estimate as a live metric.
