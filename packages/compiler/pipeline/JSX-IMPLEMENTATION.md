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

Inline JSX factories in component props preserve their parameters, local statements and per-call
captures. A function child is diagnosed (`children-function`): children are projected content, a
render function travels through a named prop. Verified by `jsx-factory-prop.unit.ts`, new CSR/SSR
snapshots and `jsx-factory-prop.spec.tsx` in CSR and resume. Existing prop readers and ordinary projections retain their output. Module and local
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
- [x] Render nested child arrays, mixed text/elements and empty values. A literal array in render
      position folds like a fragment: elements become static markup, text or effects in place,
      and lone literals render as static text; only spreads or non-literal arrays use content.
- [x] Support transitions between text, elements, arrays and empty output.
- [x] Render JSX results supplied by functions, promises, signals and stores. A callback may
      return another compiled JSX value; the dynamic-content helpers render that result too.
- [x] Support direct signal children: `{count}` lowers to the same tracked text read as
      `{count.value}`, and rendering a value as a JSX child no longer counts as an escape.
- [x] Render dynamic text as the complete component result in SSR without the
      `a root text hole outside a range` rejection.
- [x] Handle `||`, `??` and sequence expressions containing JSX while preserving short-circuit
      behavior and single evaluation. They render through one content QRL, so the JS semantics
      hold; the linker still classifies them as content rather than proven text.

Verified by `dynamic-content.spec.tsx` and `linked-content.spec.tsx` in CSR and resume, plus the
`text-hole-signal-child` snapshots. Open runtime robustness item: an error thrown while a content
block commits stops the sibling subscribers of that owner silently; `flush()` resolves anyway.

Reuse `ContentBlock` and dynamic-content helpers in `packages/qwik/src/core/dom/content/`;
complete their contract rather than introducing a parallel renderer.

Prop-dependent holes are resolved at application link time, including imported neutral library
plans. Proven text retains text effects; mixed or unresolved values use existing content ranges.
See [Linked render results](./LINKED-RENDER-RESULTS.md) for the artifact contract, verification,
snapshot audit and remaining production-build blockers.

## 4. Component targets and factories

- [x] Member tags: `<UI.Button />`, `<props.component />`. The tag lowers to a member `ValueIR`
      and the runtime dynamic-tag helper decides between element and component.
- [x] String-valued dynamic tags: `const Tag = props.as; <Tag />`. A tag whose binding links to a
      plain value calls `createDynamicTag` / `renderSsrDynamicTag`; a tag linked to a component
      declaration, local or imported, stays a direct `createComponent` call.
- [x] Function- and QRL-valued dynamic tags, through the same runtime decision.
- [x] Reactive target changes with props, projections and cleanup of the previous instance. A
      member tag rooted in props or a setup local (`<props.component />`, `<ui.Tag />`) renders
      inside its own content range, which re-renders with new props and projections and disposes
      the previous instance when the tracked read changes. A tag rooted in a module binding
      (`<UI.Button />`) stays a direct call. A setup alias such as `const Tag = props.as` is a
      live prop member (group 5), so `<Tag />` renders like `<props.as />` and re-renders too.
- [ ] Components returned by factories and wrappers. A `component$` nested in an object literal
      or returned from a factory is not discovered as a component today. This is the
      location-independent `$` extraction of group 6; solve it there rather than as a
      `component$`-only discovery path.
- [x] `component$(existingFunction)` and `componentQrl`. `component$(Body)` marks the
      module-level `Body` as a component, whatever its name or shape, and the call stays
      authored: the runtime `component$` is an identity that tags its argument.
      `componentQrl(qrl(...))` is an authored QRL component and stays as written too.

Verified by the `component-dynamic-tags` snapshots and `dynamic-tag.spec.tsx` plus the dynamic
tag cases of `component.spec.tsx` in CSR and resume. A reactive tag whose value is a compiled
component function cannot be serialized for resume; string tags and module components can.

## 5. Parameters, aliases and destructuring

Simple props, aliases, rest and some defaults are already implemented. Complete:

- [x] Nested parameter patterns. A leaf of `{ user: { name, tags: [first] } }` is a prop member
      whose read is the full path, `props.user.tags[0]`, live everywhere a direct member is; a
      nested default reads `(path === void 0 ? default : path)`. Rest stays top-level only.
- [x] Computed keys. `{ [KEY]: v }` reads `props[KEY]` when the key is a literal or a module
      binding, which survive every boundary; any other key is diagnosed.
- [x] Defaults referencing earlier parameters, such as `{ a, b = a }`. Prop defaults are
      generated parameters after `props, ctx`; a default reads earlier members through their
      resolved prop reads. Self and forward references stay diagnosed, as they would throw in
      JavaScript.
- [x] Default-expression name collisions with setup declarations. Parameter defaults evaluate in
      the parameter scope, so a body-local `const fallback` cannot shadow the default's binding.
- [x] Correct read/default/side-effect evaluation order. Generated parameters evaluate left to
      right before the body, each only when its prop is `undefined`, and the check is untracked.
- [x] Distinction between ordinary JavaScript snapshots and aliases that remain reactive under
      the framework contract. A `const` whose initializer is a prop read, a `useStore` result, a
      member chain rooted in one of them, or a signal `.value` read is a live alias: it registers
      prop-member locals (identifier or object pattern with literal defaults) and emits no
      constant, so every read, in render or a handler, goes to the source. A `let` alias, a call
      result or any other expression stays an ordinary snapshot.
- [x] Destructured store aliases after source replacement. `const { item } = store` reads
      `store.item` live, so replacing the slot updates the text; `store.spec.tsx` passes in CSR
      and resume.

Share binding facts across component parameters, callbacks and collection rows.

## 6. `$` boundaries throughout the module

Direct setup hooks and individual callbacks already work. Complete location-independent boundary
transformation:

- [x] Module-level `$()` and boundaries inside ordinary functions, for the explicit `$` marker:
      every payload is scanned once, so `$(fn)` in a call argument, a callback, a QRL body, a
      module helper or a module-level initializer becomes an explicit QRL replacing the call.
- [x] Nested `$()` inside other QRLs, through the same payload scan.
- [x] Custom `foo$`, `factory$` and user hooks outside direct component setup. The payload scan
      that extracts `$()` also recognizes custom markers with twins and records the callee: setup
      statements and module helpers call the function twin with the static callback on the client
      and the `Qrl` twin on the server; chunk bodies use the `Qrl` twin on both. Module-level
      `use*` functions are hooks: their bodies lower with the component setup lowering into
      `plan.hooks`, are emitted from that setup (twins, `$` extraction, static callbacks), and
      feed the linker's per-program facts; a hook's `return` stays ordinary JavaScript, early
      returns included. A body the setup lowering refuses, such as one with a loop, stays
      authored. A marker wrapping a core hook directly
      (`const useX$ = implicit$FirstArg(useTaskQrl)`) is a hook whose only setup call is that
      core operation, so its facts are known without touching its authored form.
- [x] Existing function references instead of inline callbacks. `$(tick)`, `useTask$(tick)`,
      `useCustom$(callback)` and `onClick$={tick}` share one rule: a `$` argument that is not
      an inline function ships as a factory chunk returning it, module bindings imported and
      per-render locals captured. An existing QRL local still passes through as itself.
- [x] Non-function QRL values: strings, objects and imported values. `$('hello')`, `$(config)`
      and `$(signal)` are the same factory chunks; the `useSerializer$` object form is no longer a
      special case. `sync$` still requires an inline capture-free function.
- [x] `useStyles$('...')` and `useStylesScoped$(css)` lower to the `Style` op and call
      `useStyles`/`useStylesScoped` with a compile-time id in both environments; object-form
      `useSerializer$` arguments ship as factory QRLs with their captures.
- [x] Non-event prop boundaries such as `fallback$`, `render$` and `then$`. Any `$` prop of a
      component lowers like a `$` argument and is passed as a QRL under its authored key, on the
      direct and the proxied props path alike; a non-event `$` attribute on an element is
      diagnosed, since no runtime consumer exists.
- [x] Correct captures and imports at every nested boundary. A QRL nested in another callback
      captures that callback's parameters and locals (`const v = track(...); $(() => v)`), in
      components and in custom hook bodies alike; module bindings keep importing.
- [x] Preserve the existing `await` transformation in newly supported locations. Every
      extracted callback records its `await`s, so `$()` in module helpers, event handlers and
      nested QRLs already rewrite them; `nested-qrl-captures` and the `$` snapshots cover it.

Leaving `$()` or `routeLoader$()` untouched is not successful QRL extraction.

## 7. DOM props and spreads

Component spreads already exist. Complete element spreads and DOM semantics:

- [x] `<div {...props}>`, multiple spreads and interleaving with explicit attributes. A spread
      of an object literal expands into ordinary attributes at analysis time, so it keeps the
      flat paths. Any other spread turns the element's whole attribute list into one props
      chunk, the same chunk proxied component props use, applied by `createPropsEffect` on the
      client and `renderSsrProps` into the open-tag record on the server.
- [x] Override order and single evaluation. The chunk builds one object literal in authored
      order, so a later key wins and each expression evaluates once per run.
- [x] A single props member is its own source. A live read of one member (`{props.title}`, a
      live alias, a forwarded child prop, an attribute, a collection source) lowers to a `Read`
      whose printer hoists one `propSource(props, 'title')` per member and render function. The
      runtime resolves it to the parent's source, a `PropSource` reading through the record for a
      computed or spread prop, or the plain value of a static prop, which every consumer applies
      once with no effect and nothing serialized. The server roots a prop source at the hoist
      behind an `isSource` guard. Reads with a default, a deeper path, a spread argument or an
      event handler keep their QRL (`prop-sources` snapshots, `prop-sources.spec.tsx` in CSR and
      resume, which also asserts an unread prop never serializes).
- [x] A computed prop is a real source. An expression passed as a component prop becomes a
      `useComputedQrl` in the parent: the chunk is emitted in the `useComputed$` shape, reading
      its captures from `_captures`, and `computedProp(qrl)` is that hook with the value never
      serialized, since a computed prop may hold JSX or a component. A child read then resolves
      to the computed itself, so the `PropSource` branch is left to spread props (`prop-sources`
      snapshots, `prop-sources.spec.tsx` proves a recompute after resume).
- [x] Addition/removal of keys in reactive spreads. The client effect diffs against its previous
      run and removes vanished keys; a resumed effect seeds its first diff from the element's
      own attributes, minus runtime `q:*` markers and event attributes (`attributes.spec.tsx`
      "removes keys that disappear from a reactive spread", CSR and resume).
- [x] Events, refs, bindings and HTML supplied through spreads. The runtime reads them from the
      props object; a `ref` binds the element id on the server, `innerHTML` replaces the authored
      children. Proven by `ref.spec.tsx` (forwarded opaque props) and `attributes.spec.tsx`
      (last-write-wins) in CSR and resume; `bind:*` and innerHTML ride the same runtime path.
- [x] Static/dynamic parity for boolean/enumerated attributes, `aria-*` and `data-*`. A literal
      expression attribute (`{false}`, `{-1}`, `{'x'}`) is a static prop, so it folds to the
      bytes the runtime serializes for the same value; live values bind under the same names
      (`attribute-parity` snapshots, `attributes.spec.tsx` "serializes boolean, enumerated and
      numeric attributes consistently").
- [x] Native DOM properties where required, especially `value` and `checked`: the attribute
      helpers set them as properties (`attributes.spec.tsx` "sets value and checked through
      native properties", CSR and resume). `selected` rides `<select>` below.
- [x] `<textarea>` and `<select>` semantics. Browsers ignore `value` markup on both, so the
      analyser renders it once as textarea content, or as `selected` on the option whose static
      `value` matches, from an inline value; a literal folds and drops the prop, a live value
      keeps the `value` property binding for later changes. Options rendered by `<Each>` or with
      a computed `value` get no server-side `selected`; the property binding still selects them
      on the client (`form-values` snapshots, `attributes.spec.tsx` "renders textarea and select
      values as content and selection" in CSR and resume).
- [x] Class/style combinations: arrays, objects, signals, removal and overrides. Serialized by
      the runtime helpers with the scoped style id (`attribute-class-style` snapshots,
      `attributes.spec.tsx` "updates class arrays and objects without losing static classes").

Reuse the rules in `packages/qwik/src/core/dom/effect/dom-props.ts` for both spread and
non-spread paths.

## 8. Events, bindings and refs

Share prop classification; deliver the following in small increments.

### Events

- [x] `document:on*$` and `window:on*$`. `eventScopeName` mirrors the runtime scope table
      (`q-w:`, `q-d:` and the passive variants); emission is unchanged because both runtimes key
      the carrier by the scope prefix, and SSR `useOn*` handlers merge into the same attribute.
- [x] `preventdefault:*`, `stoppropagation:*`, `passive:*` and `capture:*`. The first three are
      static bare attributes with the normalized event name, read by qwikloader at dispatch;
      `passive:x` selects the passive scope of the element's matching handlers and is dropped.
- [x] Inline handler arrays: extraction, captures, ordering and ignored empty entries. Nested
      arrays flatten, `null`/`undefined` entries drop, each function is its own event QRL; SSR
      joins the references with `|`, CSR registers the list with `createCapturedEvent` per
      handler that captures.
- [x] Handler arrays forwarded through components and spreads. A component event prop with
      several handlers is passed as an array of their QRLs, which the child's element resolves in
      order through the runtime list handling; spreads already hand the array through the props
      object. The proxied component props path still takes one handler per event
      (`component-handler-array` snapshots, `component.spec.tsx` "should pass event handler
      arrays to native child elements" in CSR and resume).
- [x] `sync$` emission and synchronous-handler registration. `sync$(fn)` anywhere becomes a
      `Sync` boundary QRL hoisted as `_qrlSync(fn, symbol)` with no chunk; a client event takes
      the plain function. The runtime serializes the key and writes the `qFuncs` table ahead of
      the batch, which also covers handlers imported from other modules. A capture or an outer
      read inside `sync$` is the `sync-capture` diagnostic.
- [x] Merge JSX listeners with `useOn*` without losing modifiers or duplicating registration.
      The linker's `registersEvents` fact follows `useOn*`, visible tasks and linked custom hook
      bodies; unknown only for hooks outside the link set. For true or unknown, SSR emits the
      first root element's open tag as a `createSsrOpenTag` record with `ctx.eventAttr` chunks,
      the shape the runtime already splices `useOn*` registrations into. Known-false roots stay
      flat; element-less roots keep the runtime script carrier.

### Refs

- [x] `ref={signal}` and `ref={fn}` on elements, including inside branches and rows. The ref is
      an inline value applied once when the element exists: CSR calls `setRef(value, el)`, SSR
      gives the element an id and calls `ctx.setRef(value, id)`, so a function ref runs on the
      server with the DOM-ref token and a signal ref resumes as the element (`element-refs`
      snapshots, `ref.spec.tsx` green in CSR and resume).

### Bindings

- [x] `bind:value` and `bind:checked` on elements. The analyser desugars each into a
      `value`/`checked` attribute reading the signal plus an `input` handler of the `Bind` kind,
      which both generators print as the runtime `_val`/`_chk` QRL capturing the signal, the pair
      the props-object path already builds at runtime. Only a signal local binds; anything else is
      diagnosed (`element-bind` snapshots, `attributes.spec.tsx` "binds checked and value through
      native properties" in CSR and resume).

## 9. HTML, namespaces and template correctness

- [x] Emit `dangerouslySetInnerHTML` as element content, not an attribute. A literal folds into
      the static markup and the CSR template as written; a live value is an attribute step whose
      name the runtime already routes to `innerHTML`, rendered as the element's content on the
      server and patched on the client. Authored children yield to it.
- [x] Preserve its subtree when unrelated props change. Nothing re-renders the content: only its
      own effect touches `innerHTML` (`attributes.spec.tsx` in CSR and resume).
- [x] Static text is HTML exactly once. Authored JSX text keeps its entities as written, a
      folded literal is escaped where it turns into content, and the CSR template no longer
      escapes a second time, so `<p>a &lt; b</p>` reads the same in both environments
      (`static-text-escaping` snapshots).
- [x] Correct text treatment in `script`, `style`, `textarea` and `title`. Title and textarea are
      RCDATA, so their text escapes as usual. `script` and `style` are raw text and take a
      string literal only, written as-is with a `</` guard; a live value there is diagnosed and
      belongs to `dangerouslySetInnerHTML`, since a script never re-runs on a text change and
      v2 never patched a style's text either (`raw-text-elements`, `raw-text-live-value`
      snapshots).
- [x] SVG/MathML namespaces and `foreignObject` transitions. The analyser tracks the namespace
      while lowering (`svg` and `math` open one, `foreignObject` returns to HTML) and stamps it on
      every element op inside it; a subtree in one template parses correctly on its own.
- [x] `xlink:href` and `xml:lang`. The compiler keeps the qualified name; static values parse
      into their namespace, and the runtime attribute patcher writes and removes `xlink:` and
      `xml:` attributes through `setAttributeNS`, which Firefox requires for `<use>`
      (`namespaced-attributes` snapshots, `effect.unit.ts`).
- [x] Separately created SVG nodes in branches, collections and slots. A chunk whose root carries
      a namespace builds its CSR template inside `<svg>`/`<math>` and unwraps the clone with
      `_first`, so the node lands in the right namespace (`namespace-chunks` snapshots,
      `namespace.spec.tsx` "creates branch and row nodes inside svg" in CSR and resume).
- [x] Dynamic tags inside svg or math. The analyser stamps the enclosing namespace on the
      component target of a runtime-decided tag, and only the client emitter passes it on, so
      `createDynamicTag` creates the node with `createElementNS`; the server string parses in its
      namespace by itself (`dynamic-tag-namespace` snapshots, `namespace.spec.tsx` "creates a
      dynamic tag inside svg" in CSR and resume).
- [x] HTML parser context for `table`, `tbody`, `tr`, `td`, `select` and `option`. Invalid nesting
      is diagnosed at the analyser instead of silently restructured: the parser rewrites it the
      same way on the server and in the client template, and every range marker at that
      boundary lands in the wrong place. The rule table follows React's DOM-nesting checks
      (content that closes a `<p>`, table and list structure, `select` children, elements that
      cannot nest in themselves) plus dynamic rows directly under a `<table>`, which must sit in
      an authored body (`dom-nesting.unit.ts`, `table.spec.tsx` in CSR and resume).
- [ ] Correct locators after browser HTML normalization. Done so far: RCDATA elements
      (`title`, `textarea`) fold several content parts into one hole whose value is a template
      over the parts, since the parser reads a comment marker there as text; an element child is
      diagnosed. `head` joins the nesting table, as the parser moves other
      elements into the body (`text-only-content` snapshots, `text-only-content.spec.tsx` in
      CSR and resume). An empty hole value writes nothing on the server, and resume creates
      the missing text node where the marker or element says it belongs, instead of the former
      one-space placeholder that showed inline (`empty-text-hole.spec.tsx`, `inflate.unit.ts`).
      A `template` without a declarative shadow root keeps its content in an inert fragment
      that no locator reaches, so live content there is diagnosed; a `shadowRootMode` template
      is left to the shadow-root walker work (`dom-nesting.unit.ts`). The newline the parser
      drops after `<pre>` and `<textarea>` is doubled: at the analyser for a static first child,
      by the server text writer for a live first hole, so the parsed text equals what the client
      sets (`leading-newline` snapshots, `leading-newline.spec.tsx` in CSR and resume).
- [ ] `q:shadowRoot` and container boundaries exercised by e2e.

Verify the escaping boundary between text/attributes and explicit raw HTML, including script
delimiters. Compilation snapshots alone cannot prove browser parser behavior.

## 10. Complete collection coverage

`.map`, keys, captures, destructuring and conditional rows already have substantial coverage.

- [x] Derived collections without a key. A derived source without an authored key is emitted
      with no key chunk and the runtime keys its rows by position, on render and on resume alike,
      as literal and reactive sources already did (`collection-keyless-derived` snapshots;
      `use-id.spec.tsx` now compiles, its cases wait on the `useId()` rewrite of group 12).
- [x] Function-expression and referenced callbacks, not only inline arrows. The JSX analysis
      resolves the `map` argument to its function: an inline arrow or function expression, or an
      identifier whose binding is given exactly one function (a setup-local arrow, a module-level
      declaration). The row lowers through the same program as an inline arrow; an import or a
      reassigned binding stays a dynamic value. Before this, a referenced callback rendered as a
      content block that captured the function and failed to serialize it on resume
      (`collection-callback-shapes` snapshots, `collection-callbacks.spec.tsx` in CSR and resume,
      which also asserts the rows keep their nodes across an update).
- [~] Richer callback bodies using the shared mechanism from group 1. Statements before the
  row's `return` now lower through `lowerSetup`, the component-body path: `let`/`var`,
  mutations, calls, local functions and blocks, with `const` aliases of props reading live
  as they do in a component. A hook other than `useId` inside a row is diagnosed
  (`expression-hook`, shared with every lifted body), since a row has no component owner; an
  early return stays refused until the row shape and key rules for it are decided
  (`collection-row-statements` snapshots, `collection-row-statements.spec.tsx` in CSR and
  resume). A local function captured by a hole is not serializable, the same limit as in
  component setup (group 6).
- [ ] Async rows and dynamically shaped results. An `async` row callback is diagnosed
      (`async-row`) with a pointer to tasks; support rides with the async
      program emission and pending-row behaviour of group 13, since the keyed reconciler uses
      a row's nodes synchronously.
- [x] Inline-row attribute/prop emission. An attribute reading only row constants of a literal
      array row applies once through `patchAttrValue` (CSR) or `serializeAttrExpressionValue`
      (SSR), with no effect, chunk or element id. Verified by the `collection-inline-row-attr`
      snapshots and `loops.spec.tsx` in CSR and resume.
- [x] Component rows report their output shape as unknown, so the runtime normalizes whatever
      the component returns; declaring them as node lists appended nothing on the client
      (`component.spec.tsx` "should update expression props on mapped children" in CSR).
- [x] Row-shape changes and mixed keyed/unkeyed cases required by ported tests. Main's two
      unkeyed cases are ported to `component.spec.tsx` ("reexecute a component swapped between
      branch arms without a key", "correctly rerender array without keys") and pass in CSR and
      resume with no compiler change: branch arms remount, and a keyless derived source keys by
      position. A conditional row keyed in only some arms stays a loud refusal.
- [x] `<Each>` and `<Show>` are dropped in v3. `.map` with keys and conditional expressions
      already lower to the collection and branch ops; nothing in the corpus or the e2e apps uses
      the components, and the dead `each`/`show` experimental flags are removed from the plugin.

Verify reorder, replacement, event captures and cleanup after resume, not only output snapshots.

## 11. Complete projection and slot coverage

Already implemented: default/named slots, fallback, forwarding, fragments, conditional projections
and dynamic `Slot name`.

- [x] Dynamic projection assignment: `q:slot={expression}` registers the projection under a name
      function (a value QRL on the server) and gives the slot scope a live-slot segment; every slot
      of that consumer then runs as a content range that re-resolves its projections under
      tracking, so content moves between slots and the consumer keeps its state. Static scopes keep
      the single replaced marker.
- [x] Children contract: projected content renders only through `<Slot />`. Rendering
      `props.children` (or a destructured alias) in JSX, forwarding it, a `children` attribute and a
      `children` parameter default are diagnostics; a function child stays a `children` prop.
      `props.children` reads describe the default projection: one `{ type }` per authored child
      (tag, component reference, `"text"` or `"dynamic"`), emitted only when the linked consumer
      reads it or is external, carried on the slot scope and injected into props at creation.
- [ ] Port behavioral regressions: initially absent slots, repeated hide/restore, author-side
      changes and independent cleanup.
  - [x] Ported to `projection.spec.tsx` (41 specs, csr and resume): resolved and unclaimed
        projections, detached subtrees and the numbered regressions.
  - [x] Svg-only and MathML-only tags authored outside a namespace element infer it, so
        projected svg content and foreign fragments parse in the right namespace.
  - [x] Components serialize as values: every component declaration is exported under a hashed
        symbol the client manifest maps, the server marks the function with that symbol, and a
        local alias of a component is captured as a value or read live when it indexes a signal
        (`#3727`). `useConstant` calls every function; docs must say `useConstant(() => Cmp)`.
  - [x] A body function a boundary calls lifts to a segment its callers import statically; the
        caller captures the function's captures and rebinds it, so calls stay sync and only
        loading is lazy (`#7000`). Unreferenced body functions keep their statement.
- [x] Combine slots with dynamic content, namespaces and async: covered by the projection corpus
      (branches, rows, holes, content blocks, promise children, svg and foreignObject slots, the
      live-slot swap). Error boundaries move to group 13 with Suspense.
- [ ] External projections needed by React integration (deferred, its own pair of increments): a
      client mount handle (`createComponent` into a foreign element with signal-backed props, owner
      under the qwikify host, dispose on unmount) replacing `_addProjection`/`_setProjectionTarget`/
      `_updateProjectionProps`/`_removeProjection`, then SSR islands through a raw-output entry
      replacing `SSRStream`/`SSRRaw`/`SSRComment`; proven by `e2e/qwik-react-e2e`.

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
      find the scope. The linker's `providesContextEffective` fact follows linked custom hook
      bodies; only a known provider is marked, since an unknown hook body does not imply one.
- [x] Preserve context/owner across every newly supported rendering callback: projections, nested
      slots, promise children, live slot swaps, dynamic tags, promise-rendered and signal-held
      consumers all resolve their context after resume (`context.spec.tsx`).
- [x] Register `useVisibleTask$` in SSR as a client wake event (`qvisible`, or `qinit`/`qidle`
      for the document strategies) instead of calling the hook on the server.
- [x] Defer a component's render until its initial tasks settle: SSR awaits the lane, CSR awaits
      the invoke context's initial task chain. The linker's `waitForTasks` fact follows linked
      custom hook bodies, so a hook that starts no task no longer forces the wait; a hook outside
      the link set leaves it unknown and keeps the wait.
- [ ] Verify `useId`, `useOn*`, tasks and cleanup for headless components and new root shapes.
      Done so far: headless `useOnDocument`/`useOnWindow`/`useVisibleTask$` on a projecting
      component, document events through a component root, `qvisible` marked on CSR elements.
      Open, with skipped specs in `use-on.spec.tsx`:
  - `useOn` on a dynamic root (promise root, signal-held root, one event across task rerenders):
    the runtime has a `useOnRoot` slot on content blocks and branches, but both emitters pass
    `false`, the CSR block only reapplies after a second commit, and the SSR content runtime
    ignores the flag; the content segment's first element must also keep its open-tag record.
  - A document event fired from a task during the render that removes its component: v2 skipped
    it through scheduler ordering; v3's loader skips disconnected carriers at dispatch and after
    the QRL resolves, so decide whether the mid-render window matters.
  - The structural `useOn` root replaced by a branch (`moves the carrier` spec).
  - main's `use-visible-task` corpus is ported (`visible-task.spec.tsx`, 26 specs, all green).
    A `key` on a static component is not an identity: remount through branch arms instead.
  - A `const` derived from a signal by an expression (`const text = \`v${on.value}\``) is a
    snapshot, so a prop fed from it never updates; only direct reads alias live.
  - main's `use-task` corpus (20 specs) is not ported yet.
- [x] `useId()`. A runtime counter, not the legacy seed parameter: the server counts per request
      on the root invoke context (`s…` ids), the client per container (`c…` ids), so ids never
      collide after resume, in rows, branches or later instances. The compiler treats `useId` as
      an ordinary core setup call that never blocks rendering, and rows keep the authored call.
      This breaks the rule that legacy compiler-only features stay compiler-only, deliberately:
      the seed scheme costs a parameter per component, a wrapper per child call and a captured
      seed per chunk, and still cannot make same-site instances unique (`use-id` snapshots, all
      five `use-id.spec.tsx` cases in CSR and resume).

Much of the hook runtime already exists; complete compiler output and scope propagation rather
than reimplementing each hook.

## 13. Async rendering, Suspense and Reveal

- [ ] Async components.
- [ ] Promises returning JSX or child arrays.
- [ ] Thrown-promise retry without duplicate initialization or projection.
- [ ] Lower `<Suspense>` and `<Reveal>` markers to existing runtime mechanisms.
- [ ] Fallback QRLs, delay, nested boundaries and preservation of previous content.
- [ ] `ErrorBoundary` with `fallback$` and `useErrorBoundary`: a throw or a rejected promise in a
      projected or nested render selects the nearest boundary's fallback (main has 14 specs, 9 of
      them about projections); without a boundary the render keeps rejecting as it does now.
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

- 2026-09-17: Tasks converge and triggers report, batch 3b of group 12. A write drops the writer's
  dependency on that source (`dropWriterDependency` at the signal and store write points), so a
  read-modify-write such as `log.value += x`, `store.push(x)` or `p.value = p.value.then(...)`
  never re-dirties the task that did it and two tasks sharing a source no longer ping-pong; v2 was
  safe only because `track` was explicit. `getStateRoot` shares one in-flight load per root, since
  concurrent readers (tasks of one trigger starting together) each allocated their own copy of a
  signal or store, which is also why a visible task's store reads looked untracked after resume.
  The trigger handler is one per component and event (`visibleTaskGroups`): it starts every task
  of the group together and returns their combined promise, so the loader dispatch keeps v2's
  parallel start and rejects when a task throws. A visible task error therefore surfaces through
  `qerror`. Verification: 358 core unit tests, `visible-task.spec.tsx` 52 green, corpus 689 with
  only the known Suspense red.
- 2026-09-17: Visible tasks wait for the loader on both targets, batch 3a of group 12 (the
  contract of main's #8988): `useVisibleTaskQrl` registers the trigger itself, `useOn('qvisible')`
  for the intersection strategy on server and client, `useOnDocument('qinit'/'qidle')` on the
  server, an immediate run on the client for the document strategies since the document is
  already ready; the server-only `createVisibleTaskHandlerQrl` emission is gone. The trigger wakes
  the subscription once (`SubscriberFlags.Triggered`), a `<script>` root takes `qinit` since it
  never intersects, `setEvent` re-registers scanned events once the scheduler flush has landed
  (`Scheduler.onFlushed`) so the loader observes client-rendered elements, and the loader re-scans
  on a repeated registration. A root without an
  own element wakes through a carrier on the server and, on the client, through the first element
  of a child component. Verification: 1182 pipeline tests, `visible-task.spec.tsx` (38 green, 14
  skipped for batch 3b), corpus at 672 with only the known Suspense red.
- 2026-09-16: Callbacks and headless events, batch 2 of group 12: four context specs cover live
  slot swaps, dynamic tags, promise-rendered and signal-held consumers; eight `use-on` specs port
  main's headless, component-root and `qvisible` cases. Two fixes: a dynamic tag with a component
  child rendered nothing on CSR and never re-rendered after resume because the children
  descriptor referenced the component inside a chunk that did not import it, and CSR never set
  `q-e:qvisible`, so the loader could not observe client-rendered `qvisible` listeners. The
  children contract changed with the fix: `useChildrenInfo()` returns one entry per default child
  carrying only the author's `q:type` (`{ type: 'row' }`, or the shared `_EMPTY_OBJ` without one),
  never the JSX type, so it is plain data and serializes; `q:type` is stripped from the rendered
  props, and a `<Fragment q:type>` stays one projection so text can be described too. Every
  `props.children` read is `children-read` (replacing `children-render` and `children-default`),
  a function child is `children-function` (render functions travel through a named prop), and
  the linker's `readsChildrenInfo` fact follows custom hooks so a consumer that never calls the
  hook gets no descriptor. Four `use-on` specs stay skipped under item 9. Verification: 1182
  pipeline tests, 637 corpus specs in CSR and resume
  with only the known Suspense red.
- 2026-09-16: Context through projections, batch 1 of group 12: main's nine `use-context` specs
  now live in `context.spec.tsx` as behavior assertions (provider shown after a client change,
  slot inside slot for rows and for a component, falsy values, an unclaimed projection, #4038,
  #5270, a client-written provider value). Three fixes fell out. The SSR slot content segment
  wrapped its `<!s=` fence around the sequenced value, so a projected component that returned a
  promise printed `undefined`; `slotContentEmission` now uses the shared `fence` option of
  `renderProgram` (33 snapshots flatten). `renderSsrDynamicContent` and `createDynamicContent`
  called the resolved JSX closure after the promise boundary with no invoke context, so a promise
  child inside a projection lost its owner; both capture the context first. A hook called inside
  a JSX expression compiled into the segment and ran from the scheduler without a component; the
  lifted-body guard in `lowerCaptures` diagnoses it (`expression-hook`, replacing the row-only
  `row-hook` and `hooksAllowed`; `useId` and `$` hooks stay allowed). Verification: 1176 pipeline
  tests, 621 corpus specs in CSR and resume with only the known Suspense red.
- 2026-09-15: Computed props: component prop expressions lower as Function-payload QRLs, so
  `useComputedQrl` can run them; `computedProp` is a one-line never-serialized alias. A first
  cut added an expression-backed computed class with its own type id and was removed once the
  chunk shape turned out to be the whole difference. Two propagation fixes in core surfaced
  through the corpus: `markComputedDirty` skipped a dirty computed even when it had
  resumed without a value and never told its subscribers, and a synchronous recompute pulled
  after a dirty mark notified subscribers a second time, which made a slot content block re-run
  and dispose the projection it had just reused. Verification: reactive, effect and serdes
  units, `prop-sources.spec.tsx` and `slot.spec.tsx` in CSR and resume, both corpora unchanged.

- 2026-09-15: Prop sources, compiler half: `tryPropMemberRead` in `lower-expr.ts` produces the
  `Read`, `readSource` in `emit-setup.ts` replaces `signalReadName` for both targets and the
  component emitter, the content linker accepts a member read, and SSR steps now push their own
  statements before roots so a hoisted name is declared before it is rooted. 89 snapshots lose
  a text, attribute or collection-source chunk. A first attempt to register computed props as
  `useComputedQrl` was reverted for the reason in the group 7 TODO. Verification: 1151 pipeline
  tests, the new spec in CSR and resume, both corpora unchanged.

- 2026-09-15: Prop sources, runtime half: `propSource(props, key)` in `component/props.ts`
  returns the parent's registered source, a `PropSource` reading through the record for a
  computed or spread prop, or the plain value of a static prop. A constant in a source's place
  means "apply once": the text and attribute effects track nothing, the SSR writers register no
  subscription and root nothing, and `_props` keeps only sources and QRLs in its map. `isSource`
  is the nominal check; `PropSource` serializes as `[props, key]` beside `StorePropSource`. The
  compiler switch to it is the next increment. Verification: props, effect and serdes unit
  suites, both corpora unchanged.

- 2026-09-15: Row statements: `readReturnedBody` keeps only the final-`return` rule,
  `lowerRowProgram` hands the statements to `lowerSetup` (hooks are refused by the lifted-body
  guard in `lowerCaptures`), and `lowerKey` still replays only `const` declarators. Ten
  `collection-key-*` snapshots change because a row's `const title = props.title` is now a
  live alias, so the hole captures `props` instead of a snapshot; `use-id.ssr.snap` only
  reorders an import.
  Verification: 1149 pipeline tests, the new spec in CSR and resume, both corpora unchanged.

- 2026-09-15: Unkeyed rows: ported main's two specs as DOM assertions; the `jsx()` factory call
  in the first becomes plain JSX in each ternary arm. No code change; both green.

- 2026-09-15: Row callbacks: `rowCallback` in `ast/jsx-analysis.ts` widens `Collection.callback`
  to `RowCallback`; the collection lowering takes the whole collection value and names inline
  row functions after the call site rather than the callback, so two static-array maps over one
  referenced function cannot collide (28 snapshots rename accordingly). Verification: 1148
  pipeline tests, the new spec in CSR and resume, both corpora unchanged.

- 2026-09-15: Leading newlines: `NEWLINE_EATING_ELEMENTS` in `html.ts` drives a one-line
  doubling in `lowerJsx` and an `escapedText` wrapper in the SSR emitter for the first hole of
  such an element. Verification: 1146 pipeline tests, the new spec in CSR and resume, both
  corpora unchanged.

- 2026-09-15: Inert templates: `isFullyStaticSubtree` and `inlineStringValue` move to the
  phase-neutral `static-subtree.ts` so the analyser can refuse live content under a `template`
  with the same predicate the generators fold by. Verification: 1144 pipeline tests, both
  corpora unchanged.

- 2026-09-15: Empty text holes: `ensureTextNode` in `runtime/node-walker.ts` backs the three
  text finders, so `serializeSsrTextValue` and its space placeholder are gone; the unit tests
  that codified the space now expect nothing. Verification: runtime unit suites, the new spec
  and `signal.spec.tsx` in CSR and resume, both corpora unchanged.

- 2026-09-15: Text-only content: `lowerContentChildren` folds the parts of a `title` or
  `textarea` into one `Template` IR hole through `lowerTemplateValue`, which shares the
  computed-QRL construction with `lowerComputedExpressionValue`; the chunk printer and the
  dependency walker learn the `Template` node. `script` and `style` content is a literal
  guarded at the analyser, so the SSR emitter's raw-text branches are gone. A folded part keeps JS string
  coercion, so `null` prints as `null`, the same as an authored template literal. The JSX types
  already limit these elements to one string child. Verification: 1137 pipeline tests, the
  nesting unit cases, the new spec in CSR and resume, both corpora unchanged.

- 2026-09-15: `idBase` removed. Since `useId` counts at runtime, the seed threaded through
  branches, collections, `for` blocks, projections, dynamic tags, the serializer and the inflater
  was dead; the compiler stops emitting its `''` placeholder in collection calls (98 snapshots
  lose that argument), `invokeWithCollector4` is deleted in favour of `runWithCollector` with `invoke`, and the branch and
  for-block resume tuples drop the slot. Verification: runtime unit suites, both corpora
  unchanged.

- 2026-09-15: Dynamic tags in foreign namespaces: the `Raw`, `Dynamic` and linked `Declaration`
  component targets carry an optional `namespace`; `createDynamicTag` takes it in place of the
  unused `idBase` parameter. Verification: 1130 pipeline tests (16 existing TODOs), the namespace
  spec in CSR and resume, both corpora unchanged.

- 2026-09-15: DOM nesting: `checkDomNesting` in `analyse/dom-nesting.ts` runs from the element
  lowering with a tag stack on the lower context, and the child lowering refuses ranges directly
  under a `<table>`; a synthetic
  `tbody` was tried and discarded in favour of failing loudly, since only the table case has a
  node the parser would insert. Verification: 1128 pipeline tests (16 existing TODOs), the
  nesting unit tests, the new table spec, and both corpora unchanged.

- 2026-09-15: Namespaced attributes: `patchAttrValue` picks the XLink or XML namespace from the
  attribute prefix; the compiler already passed the qualified name through. Verification: 1112
  pipeline tests (16 existing TODOs), the `namespaced-attributes` snapshots, the runtime unit
  test, and both corpora unchanged.

- 2026-09-15: Namespace chunks: `LowerContext.namespace` and `Element.namespace` record the
  foreign namespace; `elementRoot` wraps a namespaced root's template and unwraps it after
  cloning, and row roots now mount through the same `elementRoot` instead of a copy of it.
  Verification: 1110 pipeline tests (16 existing TODOs), the `namespace-chunks` snapshots, and the
  new namespace spec in CSR and resume.

- 2026-09-15: Raw text elements: the SSR text emitters take a raw-text flag from the enclosing
  tag and print `value.replace(/<\//g, '<\\/')` instead of `escapeHTML(value)` inside `script`
  and `style`. Verification: 1108 pipeline tests (16 existing TODOs), the `raw-text-elements`
  snapshots, and both corpora unchanged.

- 2026-09-15: Static text: `foldStaticOp` lost its escape flag and the CSR template builders their
  `escapeText` calls; the textarea literal, the one static source that is decoded text, escapes
  at the analyser. Verification: 1106 pipeline tests (16 existing TODOs), the
  `static-text-escaping` snapshots, one reseeded snapshot, and both corpora unchanged.

- 2026-09-14: Component rows: `deriveRowShape` returns `Unknown` for a component or range row
  instead of `Many`, which the runtime read as an array of nodes. Verification: 1104 pipeline
  tests (16 existing TODOs), 18 reseeded snapshots carrying the new shape code, and the CSR
  corpus down to the task fallback case.

- 2026-09-14: `useId`: the runtime `useId` counts on the server root invoke context or the
  client container with an environment prefix; the compiler registers `useId` as a core setup
  call (`CoreOperation.UseId`). A seed-parameter version was built and discarded as heavier in
  output and compiler alike. Verification: 1104 pipeline tests (16 existing TODOs), the `use-id`
  snapshots, runtime unit tests, and `use-id.spec.tsx` fully green in CSR and resume; the
  resume corpus has no failures left.

- 2026-09-14: Keyless collections: the analyser no longer refuses a derived source without a
  row key; the runtime's index keys apply. Verification: 1102 pipeline tests (16 existing
  TODOs), the `collection-keyless-derived` snapshots and updated collection unit tests.
  `use-id.spec.tsx` compiles now; every case then fails on the runtime's "useId() must be
  transformed by the Qwik compiler", so the `useId()` rewrite (schema `SetupKind.UseId`, payload
  `useIds`) is the next red item, under group 12.

- 2026-09-14: Handler arrays: the component prop emitter maps every handler of an event prop to
  its QRL and prints a list when there is more than one. Verification: 1100 pipeline tests (16
  existing TODOs), the `component-handler-array` snapshots, and the new spec passing in CSR and
  resume. Group 8 is complete.

- 2026-09-14: Bindings: `lowerBinding` desugars `bind:*` into the dynamic attribute plus a
  `HandlerKind.Bind` event handler naming its signal; `bindHandlerJs` prints the runtime QRL for
  both generators. The unused `PropKind.Bind` variant left the schema. A bound textarea keeps
  its content through the form-value lowering, whose hole is now marked text. Verification:
  1098 pipeline tests (16 existing TODOs), the `element-bind` snapshots, and `attributes.spec.tsx`
  fully green in CSR and resume.

- 2026-09-14: Refs: `lowerRef` turns `ref={x}` into the `Ref` prop the schema already had, with
  an inline value and the mode from the expression shape; CSR emits `setRef` after locating the
  element, SSR emits `ctx.setRef` against the element id as a plain statement. Verification:
  1096 pipeline tests (16 existing TODOs), the `element-refs` snapshots, and `ref.spec.tsx`
  fully green in CSR and resume.

- 2026-09-14: Form values: `lowerFormValue` gives `<textarea value>` its content and static
  `<option>`s their `selected` from the select's value, both as initial-only inline values, so the
  server needs no extra subscription and the client applies them once at mount. Verification:
  1094 pipeline tests (16 existing TODOs), the `form-values` snapshots, and the new spec passing
  in CSR and resume.

- 2026-09-14: Attribute parity: a literal expression attribute lowers to a static prop
  (`tryLowerExprIr` now folds `-1`), so `{false}`/`{true}`/`{-1}` fold into markup instead of a
  chunk per attribute; the `component-marker` snapshots shrank by 93 lines. Verification: 1092
  pipeline tests (16 existing TODOs), the `attribute-parity` and `attribute-class-style`
  snapshots, and the new native-property spec passing in CSR and resume.

- 2026-09-14: innerHTML: `lowerInnerHtml` turns `dangerouslySetInnerHTML` into the `InnerHtml`
  prop the schema already had; `inlineStringValue` lets the static fold, the CSR template and the
  SSR parts print a literal as raw content, while a live value reuses the attribute step
  (`attrStep`, shared with dynamic attributes) and the client attribute effect. Verification:
  1088 pipeline tests (16 existing TODOs), the `element-inner-html` snapshots, and the core corpus
  where both `attributes.spec.tsx` innerHTML cases pass in CSR and resume.

- 2026-09-13: Element spreads: `expandLiteralSpread` turns `{...{ a: x }}` into attributes;
  `lowerPropsChunk` is shared by proxied component props and the element `propsEffect` slot the
  schema already carried. CSR wires `createPropsEffect`, SSR renders `renderSsrProps` as an
  async step into the open-tag record with `innerHTML ?? children` and the ref bound to the id.
  A composed event value beside a spread (`cond ? [...handlers, $(...)] : x`) is a plain chunk
  entry whose markers extract, which is what the router's form component needs. Verification:
  1086 pipeline tests (16 existing TODOs), the `element-literal-spread` and
  `element-spread-props` snapshots, and the core corpus where `attributes.spec.tsx` and
  `ref.spec.tsx` now compile: 10 more tests pass; the remaining failures there are `bind:*`,
  explicit refs and innerHTML normalization (groups 8 and 9). The runtime props effect now
  seeds its first run from the element's attributes, so a resumed effect removes keys that
  vanish without serializing anything extra.
  The router build now fails later, on a branch arm capturing a component in
  `router-outlet-component.tsx`.

- 2026-09-13: Component references: discovery collects the names passed to `component$` and
  treats the module-level functions they name as marked components; the call itself stays
  authored because the runtime marker is an identity. Verification: 1082 pipeline tests (16
  existing TODOs), the `component-reference` snapshots, and the core corpus in CSR and resume
  with only the known group 7/10/13 failures.

- 2026-09-13: `$` component props: `lowerComponentPropValue` routes a `$`-suffixed prop through
  `lowerQrlArgument`, sharing the prop boundary descriptor with JSX factory props; the proxied
  props path does the same per part. Verification: 1081 pipeline tests (16 existing TODOs), the
  new `component-qrl-props` snapshots, an element refusal unit test, and the core corpus in CSR
  and resume with only the known group 7/10/13 failures.

- 2026-09-13: Value QRL arguments: `lowerQrlArgument` is the single entry for a `$` argument,
  used by markers anywhere and by setup hook calls; a non-function argument becomes the same
  factory chunk `useSerializer$` objects already used. Retained authored core imports are now
  computed after helper extraction and skip replaced marker callees, so `$` and `sync$` no longer
  linger in main-module imports. Verification: 1078 pipeline tests (16 existing TODOs), the new
  `qrl-value-arguments` snapshots, updated hook/computed/qrl setup unit tests, and the core corpus
  in CSR and resume with only the known group 7/10/13 failures.

- 2026-09-13: Nested boundary captures: `lowerFunctionQrl` scans the callback node itself, so
  its parameters and locals are in scope for markers inside it; a marker call counts as
  extracted only after its lowering succeeds, so a refused hook body no longer hides its markers
  from the module-helper scan. Reads inside a replaced marker callee or callback are dropped from
  the enclosing payload, so chunks no longer import `$`, a custom marker's authored name or
  bindings only the nested QRL uses. Verification: 1079 pipeline tests (16 existing TODOs), the new
  `nested-qrl-captures` snapshots, and the core corpus in CSR and resume with only the known
  group 7/10/13 failures.

- 2026-09-13: Live setup aliases: `aliasSource` classifies a `const` initializer as a prop read,
  a `useStore` result (new `LocalKind.Store` / `CoreOperation.CreateStore`), a member chain
  rooted in one, or a signal `.value` read; `lowerAliasDeclaration` registers the pattern's
  members as `PropMember` locals with the source read and emits no setup entry. Alias tags reuse
  the member-tag content range. Store locals pass through component props as-is like other
  locals. Verification: 1077 pipeline tests (16 existing TODOs), the `setup-live-aliases`
  snapshots, reseeded const-setup/dynamic-tags/prop-defaults/store snapshots, and the core corpus
  in CSR and resume where `store.spec.tsx` and `dynamic-tag.spec.tsx` pass; the remaining
  corpus failures are the known group 7/10/13 items.

- 2026-09-13: Nested and computed parameter patterns: `readObjectParameter` collects every leaf
  with its prop path; a non-direct leaf carries a full read IR on its `PropMember` local, which
  `localReadIr`, prop defaults and the IR printer (`Index`, `Bin`, `Undef` cases) honour.
  Collection rows keep their direct-member fast path. Verification: 1075 pipeline tests (16
  existing TODOs), the `component-nested-params` snapshots, updated `prop-aliases` unit tests,
  and a new `component.spec.tsx` case reading nested, indexed and computed props reactively in
  CSR and resume.

- 2026-09-13: Prop defaults as generated parameters: `parameterDefaults` prints each
  `PropDefault` as `defaultValue = untrack(() => props.x === void 0) ? (init) : void 0` in the
  component signature, so JavaScript's own parameter-scope semantics give earlier-member
  references and shadowing immunity for free. Verification: 1073 pipeline tests (16 existing
  TODOs), the `component-prop-default-scope` snapshots, updated `prop-defaults`/`prop-rest`
  unit tests, and the `component`, `props` and `component-body` specs in CSR and resume.

- 2026-09-13: `sync$`: the marker scan recognizes `sync$` and lowers its callback as a `Sync`
  boundary; event handlers written as `$()`/`sync$()` calls become the QRL directly instead of a
  value chunk; both generators hoist `_qrlSync(fn, symbol)` and chunk emission skips sync QRLs.
  Verification: 1071 pipeline tests (16 existing TODOs), the `sync-handlers` snapshots, and
  `scripts.spec.tsx` fully green in resume (was 3 failed).

- 2026-09-13: Event handler arrays: `lowerEventAttribute` lowers each element of a handler
  array through the same per-handler path, so the existing multi-handler emission joins them;
  CSR wraps handlers that capture with `createCapturedEvent` instead of refusing shared captures.
  Verification: 1069 pipeline tests (16 existing TODOs), the `event-handler-arrays` snapshots,
  and `scripts.spec.tsx` "inline event handler arrays" green in resume.

- 2026-09-13: Custom hook bodies: module-level `use*` functions lower into `plan.hooks` with the
  component setup lowering, are emitted from that setup through a `Hook` assembly intent in both
  generators, and carry linked dependencies for their imports. The linker's setup facts
  (`registersEvents`, `waitForTasks`, `providesContextEffective`) follow hook declarations across
  modules through the twin names and answer unknown only for bodies outside the link set; the
  emitters read the facts instead of per-call heuristics. Verification: 1067 pipeline tests (16
  existing TODOs), the `custom-hook-bodies` two-module snapshots, and `use-on`, `task`, `context`,
  `store` and `use-server-data` specs in CSR and resume. Core spec corpus unchanged.

- 2026-09-13: `useOn*` on the server: the linker's `registersEvents` fact decides per program
  whether events may be registered, following hook declarations when they are linked; SSR emits
  such a root element as an open-tag record with event-attr chunks, the shape the runtime already
  splices `useOn*` registrations into. No runtime change. Verification: 1065 pipeline tests (16
  existing TODOs), the `setup-use-on` snapshots, six setup snapshots gaining the record, and
  `use-on.spec.tsx` 21/21 in resume (was 10 failed). Core spec corpus: resume 6 → 5 failed
  files, CSR 6 unchanged.

- 2026-09-13: Custom markers anywhere: a payload QRL entry may carry a `marker` with the callee
  range and target; the linker resolves its twins like setup calls, and `withMarkerEmitter`
  gives each generator's payload emitter the twin callee plus the callback in the same form the
  setup path uses. Verification: 1063 pipeline tests (16 existing TODOs) and the
  `marker-qrl-anywhere` CSR/SSR snapshots. Core spec corpus unchanged: CSR 6, resume 6 failed
  files.

- 2026-09-13: Explicit `$()` anywhere: `recordPayloadQrls` walks every payload (setup
  statements, expression values, QRL bodies, module helpers and module-level `$()` roots) and
  replaces each `$(fn)` with an explicit QRL through `lowerFunctionQrl`; native function scopes
  reuse the callback-scope builder JSX callbacks already had. Verification: 1061 pipeline tests
  (16 existing TODOs), the `explicit-qrl-anywhere` CSR/SSR snapshots, and `use-on.spec.tsx` in
  resume 17 → 10 failed (window and document `useOn*` cases pass; element-scoped `useOn` waits on
  the SSR open-tag slot above). Core spec corpus: CSR 6, resume 6 failed files, unchanged.

- 2026-09-13: Event scopes and modifiers: namespaced JSX attributes lower through the shared
  attribute-name reader; `window:on*$`/`document:on*$` map to their runtime scope keys with
  passive variants driven by `passive:x`, and `preventdefault:`/`stoppropagation:`/`capture:`
  stay bare attributes. Verification: 1059 pipeline tests (16 existing TODOs), the
  `event-scopes-modifiers` CSR/SSR snapshots, and `use-on.spec.tsx` 21/21 in CSR. In resume the
  file now compiles and fails only on explicit `$()` call arguments (group 6). Core spec corpus:
  CSR 7 → 6 failed files, resume 6 unchanged.

- 2026-09-13: Inline-row attributes: the dynamic-attribute emitters gained the `Inline` resume
  branch that text holes and events already had, so a literal-array row's `id={'row-' + item}`
  is applied once via the existing runtime attribute helpers; SSR no longer stamps `q:id` on an
  element whose only dynamic attributes are row constants. Verification: 1054 pipeline tests
  (16 existing TODOs), the `collection-inline-row-attr` CSR/SSR snapshots, and `loops.spec.tsx`
  6/6 in CSR and resume, which previously failed to compile.

- 2026-09-12: Reactive tags: a member tag rooted in props or a setup local lowers through the
  same content-range helper as a dynamic slot name, so the tag read happens inside a tracked
  render and a change re-creates the element or component. Emission reads the tag into a local
  before `createComponent`, since the component factory runs untracked. Verification: 1052
  pipeline tests (16 existing TODOs), the updated `component-dynamic-tags` snapshots, and the
  new `dynamic-tag.spec.tsx` case in CSR and resume. Core spec corpus unchanged: CSR 3, resume 5
  failed.

- 2026-09-12: Dynamic tags: member tags lower to a `Dynamic` component target carrying a member
  `ValueIR`, and a tag whose binding links to a plain value is emitted as
  `createComponent((props) => <dynamicTag>(Tag, props, ctx), …)` using the target's runtime
  helper; component declarations, including local ones, keep the direct call. Verification: 1052
  pipeline tests (16 existing TODOs), the `component-dynamic-tags` snapshots and
  `dynamic-tag.spec.tsx` in CSR and resume. Core spec corpus: CSR 4 → 3, resume 6 → 5 failed.

- 2026-09-12: Literal arrays in render position, including branch arms, rows and nested arrays,
  fold like fragments instead of a content block plus per-element chunks; lone string and number
  literals render as static text, and boolean literals render nothing. Verification: 1050
  pipeline tests (16 existing TODOs), the `dynamic-child-*` snapshots per table row, and
  `dynamic-content.spec.tsx` in CSR and resume. Core spec corpus unchanged: CSR 4, resume 6 failed.

- 2026-09-12: Group 3 verified end to end. New `dynamic-content.spec.tsx` covers nested arrays,
  text/element/array/empty transitions, function/promise/signal/store results and `||`/`??`
  with single evaluation, all green in CSR and resume. Fixes on the way: `createDynamicContent`
  and `renderSsrDynamicContent` render a QRL returned by a callback; a bare signal child lowers
  as a tracked text read; rendering a child no longer records an escape, so the linker keeps
  such holes as text. Verification: 1032 pipeline tests (16 existing TODOs). Core spec corpus:
  CSR 4 failed, resume 6 failed, unchanged apart from flaky task/serializer cases.

- 2026-09-12: Two analysis fixes. Lowercase JSX tags are intrinsic elements and no longer resolve
  to a same-named local, which wrongly refused branch arms such as `button.value ? <button/> :
<a/>`. A `.value` read on a row value falls back to the ordinary captured expression instead
  of being rejected. Verification: 1030 pipeline tests (16 existing TODOs), a `bindings.unit.ts`
  case and the `collection-row-signal` snapshots. `scripts.spec.tsx` and `use-on.spec.tsx` now
  compile: `scripts` passes in CSR and shows its four `sync$` cases in resume (group 8);
  `use-on` next stops on a namespaced JSX attribute (group 8). Core spec corpus: CSR 4 failed,
  resume 7 failed, of which `task` "retries a task that reads a pending async value" is flaky
  and passes on rerun.

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
