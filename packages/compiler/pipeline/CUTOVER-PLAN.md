# Compiler cutover plan

Decided 2026-09-17 (Varixo) through the wayfinder map at `.scratch/compiler-pipeline-cutover/`
(local, gitignored; research reports live there). This file is the committed, self-contained
version: the destination, the standing decisions, and the twelve execution steps with their gates.
It supersedes the remaining groups of [JSX-IMPLEMENTATION.md](./JSX-IMPLEMENTATION.md) (13, 14, 15)
and the phases in [DESIGN.md](./DESIGN.md). Vocabulary: [CONTEXT.md](../CONTEXT.md).

## Destination

Legacy `packages/compiler/src` is deleted and the staged pipeline is the only compiler in dev and
production builds, with today's green suites still green. Suspense, Reveal, ErrorBoundary,
multi-head SSR and out-of-order streaming for Suspense work on it. The server `LinkedPlan` is
written as a whole-app JSON artifact with no `Js` bodies reachable from the server, proven by a
fresh-process regeneration gate, so a native generator or interpreter can be built from it without
further compiler changes. Building that engine is out of scope; so are `useResource`,
`SSRStream`/`SSRRaw`/`SSRComment`, embedded containers, React external projections and the
event-only qwikloader optimization.

## Standing decisions

- No-holes beats "JS is the baseline" for server-reachable bodies; client-only code (element
  handlers, `useVisibleTask$`, `sync$`) stays JS text forever.
- A lowered body carries IR **beside** its authored range. JS generators keep slicing authored
  text; native readers use the IR; a test reference interpreter proves fidelity by identical HTML.
- The plan format stays engine-agnostic; interpreter versus generator is not decided here.
- `native$` in source is the whole plugin system. No manifest field, no vite option.
- Cutover needs no extra gate; legacy was never finished. Bar = no regression against recorded
  suites. A series of green commits in one PR, no flag at any point.
- Coverage contract: snapshots + core behavior specs + unit tests for pure helpers + a schema
  variant-coverage gate. Not per-file tests. Architecture bar: single responsibility, no line
  ceiling.
- Every refusal is a diagnostic that taints one declaration, never a module; `analyseModule`
  never throws.
- Seeds first, stop for review, implement after the go. E2E fixture edits are presented for
  approval. No legacy accommodation; snapshots adopt staged formatting.

## Route

### 1. Cutover prerequisites

- **Render-results recursion.** `x.value = x.value.<method>(...)` plus a hole reading a suffix of
  the written property makes `readBinding` grow the query path by an infix
  (`writePrefix ++ [method, #return] ++ suffix`), which neither the re-entry set nor the
  prefix/suffix guard catches. Rule: a cycle through an assignment is a fixpoint. Fix: a guard in
  `readBinding` for "same binding, same head and tail, longer middle" plus a small depth cap, both
  answering `Unknown` silently. Regression inputs: signal `.filter` in a handler + `{x.value.length}`;
  the same write in setup + `{x.value[0]}`; `store.data = store.data.concat([2])` + `{store.data.length}`;
  `.filter` + `{x.value.map(i => <li>{i}</li>)}`; `state.logs = state.logs.slice()` + `{state.logs.join(' ')}`;
  control `{x.value}` keeps its kind.
- **Silent non-extraction.** `component$` inside a plain function is supported: the payload scan that
  extracts `$()` anywhere also makes `component$` a component QRL value, capturing the enclosing
  function's parameters. Runtime `jsx()`/`jsxDEV()` calls are diagnosed (`runtime-jsx-call`), fail
  closed; the one e2e user (`slot.tsx`, `RouteActionResultNavigationIssue3727`) is rewritten to
  authored JSX after approval. An analyser invariant test fails when a candidate rollback pushes no
  diagnostic. `event$(fn)` emits `eventQrl(qrl)` like every marker with a twin; `sync$` stays a
  compile-time marker.
- **Gate.** The acceptance sweep (every `.tsx` under `e2e/**`, `packages/docs/src`,
  `packages/insights/src`, `starters/`, both environments) reports zero rejects on e2e apps; docs
  and insights rejects get a listed allowance.

### 2. Absorb legacy

| legacy `src/`                                                         | pipeline home                                                                                                                                  | shape                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expr-ir.ts`                                                          | `schema/value-ir.ts`                                                                                                                           | `BindingId` → `LocalId`; drop the never-produced `Call`, `DefCall`, `PluginCall`, `LambdaIR`, `FnArgIR`, `QrlArgIR`, `RenderArgIR` (step 10 re-adds what it needs on its own terms); keep `TExtension`; no `build-constant` leaf yet (step 9) |
| `normalization.ts` `createOriginalRangeMapper`, `createNodeSourceMap` | `source-maps.ts` (phase-neutral root file)                                                                                                     | verbatim                                                                                                                                                                                                                                      |
| `module-assembly.ts`                                                  | `generate/source-assembly.ts` (a sibling: `assemble-module.ts` and `emit-chunk.ts` both import it, and folding it into the former would cycle) | verbatim                                                                                                                                                                                                                                      |
| `emit-qrl.ts` `applyReplacements`                                     | private in `generate/emit-chunk.ts`                                                                                                            | verbatim                                                                                                                                                                                                                                      |
| `source-location.ts` `createSourceLocation`                           | inlined in `transform-modules.ts`                                                                                                              | verbatim                                                                                                                                                                                                                                      |
| `compat/transform-modules.ts`                                         | `transform-modules.ts`, the per-module host entry                                                                                              | rename                                                                                                                                                                                                                                        |
| `src/index.ts` `extractRenderRoots` (~215 lines, oxc only)            | pipeline, with its four `analysis.unit.ts` cases                                                                                               | move, `parseSync` → `parseModule`                                                                                                                                                                                                             |

Guardrail: eslint `no-restricted-imports` forbidding `../src` from the pipeline. Gate: 434
snapshots byte-unchanged, `source-maps.unit.ts`, `schema.unit.ts`.

### 3. Suspense port

Recognize `Suspense` by binding identity like `Slot`, erase the marker, children → content
`Program`, `fallback$` → an ordinary render QRL, `delay` → `Value`, into the existing
`OpKind.Suspense`; both generators emit `createSuspense` / `createSsrSuspense` as the legacy
generators did. No Suspense-specific QRL role, no host element. Gate: the known Suspense red in
`task.spec.tsx` goes green; the 16 suspense e2e tests stay green. This step precedes the flip so
`suspense.tsx` compiles under step 1's diagnostics.

### 4. Cutover commit series

1. `plugin.ts` calls the pipeline `transformModules` (per-module, incomplete link).
2. Delete: `src/**` (minus step 2's moves), `generators/**`, `conformance/layerA/**`, specs
   01/02/03/07/08/09, `specs/TODO.md`, `REQUIREMENTS.md`, `PLAN.md`, `TARGET_NATIVE_HANDOFF.md`,
   `JSX_TRANSFORM.md`, `qwik-vite/src/plugins/ssr-plan.ts` and the `ssrPlan` option/collector,
   `packages/qwik/native/**`, root scripts `build.native`/`build.native.apps`/`serve.native`/
   `start.native`, `e2e/qwik-e2e/native-build.ts`, `native-serve.ts`, `playwright.native.config.ts`,
   CI jobs `test-native`/`save-native-cache`/`check cache: native engine` and their cache keys.
   Core dead code: `createDomBatchEffect`, `patchTextValue`, `getPropSource`, `getMemberSource`,
   plus the stray index exports of `renderDomPropsToString` and `createVisibleTaskHandlerQrl`.
   Keep: `conformance/layer0`, specs 04/05/06/10, `MULTI_HEAD_SSR.md`, the record layer and headless
   carriers (pipeline output still uses them).
3. Flat exports from the package entry: `transformModules`, `analyseModule`, `linkPlans`,
   `generateJsSsr`, `generateJsCsr`, `createLibraryPlan`, `readLibraryPlan`, schema types,
   `extractRenderRoots`; `linked-build.ts` drops the `pipeline` namespace.
4. `git mv pipeline src`; vite entry, tsconfig aliases and `include` unchanged; docs and paths updated.

Bar, recorded the day before: `vitest run packages` (core corpus csr/resume/ssr + pipeline),
`test.e2e.chromium`, `test.e2e.qwik-react`, `tsc.check`, `build.full`; plus step 1's sweep. Docs'
`Each`/`Show` imports are not on the bar.

### 5. Responsibility map

Pure moves, gated by byte-unchanged snapshots and plan snapshots; the README layout table is the
enforcement.

| today                                                                               | after                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate/js-ssr.ts`, `generate/js-csr.ts` (one `generateModule` closure each)      | `generate/ssr/{element,component,collection,branch,content,events}.ts` and `generate/csr/…` over an explicit emitter context; two dispatchers; shared leaf helpers only                                                                                                                                                                                        |
| `generate/emit-chunk.ts`                                                            | `print-js.ts` (`valueIrJs`, `memberJs`, `expressionJs`, `inlineValueJs`, `bindHandlerJs`, `extractPayloadJs`, `functionText`), `qrl-chunks.ts` (`emitQrlChunks`, `syncQrlHoists`, `createQrlResolver`, chunk filename/module code), `captures.ts` (names, preludes, bound/static references, root args); `programKind`, `rowShapeCode` beside program emission |
| `analyse/lower-jsx.ts`                                                              | `lower-element.ts`, `lower-component.ts`, `lower-children.ts`, `lower-projection.ts`, `lower-render-qrl.ts`                                                                                                                                                                                                                                                    |
| `analyse/lower-setup.ts`                                                            | statements/declarations/aliases/local functions stay; `lower-setup-call.ts` takes `resolveSetupCall`, setup calls, style, visible-task event, call targets, hook args, callbacks; step 10's statement IR in `lower-statement.ts`                                                                                                                               |
| `analyse/lower-hole.ts`                                                             | `lower-text.ts`                                                                                                                                                                                                                                                                                                                                                |
| `link/render-results.ts`                                                            | `link/render-results/{exposed,active,mutations,evaluate,classify}.ts` over an explicit query context                                                                                                                                                                                                                                                           |
| `link/link-plans.ts`                                                                | `link/{resolve,materialize,reachability}.ts` + `linkPlans` orchestrator                                                                                                                                                                                                                                                                                        |
| `names.ts` + `generate/names.ts`; `analyse/type-results.ts`, `link/type-results.ts` | `generate/names.ts`; `analyse/type-contracts.ts`, `link/type-queries.ts`                                                                                                                                                                                                                                                                                       |

### 6. Test contract

- `snapshots.unit.ts` splits by construct family (`jsx-value`, `events`, `props`, `collections`,
  `projections`, `setup-hooks`, `html-namespaces`, `dynamic-tags`, `async-boundaries`); snap names
  unchanged.
- Fixtures become exported registries `tests/fixtures/<family>.ts` (`{ name, path?, code }[]`),
  consumed by the snapshot tests, the artifact gate (step 8), the coverage gate and the reference
  interpreter (step 10).
- A third file per fixture, `<name>.plan.snap`, holds the linked server plan JSON with relocated paths.
- `coverage.unit.ts` links the registry once, collects every discriminant value per schema
  `const enum` (read from `schema/*.ts` text), fails on any unproduced value outside a hand-kept
  allowlist. Shrinking the allowlist is the coverage metric.
- No `test.todo` survives. Direct unit tests only for pure helpers (`html.ts`, `static-subtree.ts`,
  `source-maps.ts`; `schema`, `segment-identity`, `library-plan` exist).
- Named `compiler` project in the root vitest config; root `test.compiler` script.

### 7. Live-plan dev host

Compiler-owned `createLinkedApp()` (no Vite types): per-file `ModulePlan` cache; on change or first
sight of a module, replace its plan, relink the whole app, regenerate, hash every generated module and
invalidate only the sources whose output changed. No incremental joins; the linker stays pure
(measured: ≈250 ms docs, ≈330 ms e2e per environment, versus 1–6 ms per single-module transform).
The set is the modules seen so far, `complete: false`, plus an eager crawl from the SSR entry on
the first request. `link/type-queries.ts` uses a TypeScript `LanguageService` over a versioned
in-memory host instead of a per-link `createProgram` (≈100 ms of every link today). One cache, two
live plans (server, browser). Thin qwik-vite adapter for load, crawl and invalidate; `linked-build.ts`
shares the host. The per-module `transformModules` stays for the test harness and library API only.

### 8. Completeness and artifacts

- A refusal aborts only the candidate it hit and marks that declaration `Failed` with its code; the
  module's other declarations link normally. A complete link fails only on **reachable** failures
  from an entry: a dangling resolved edge, a non-External unresolved edge, a failed explicit export
  root, a tainted declaration, and under `jsHoles: 'forbid'` a server hole. Diagnostics gain
  `reachable: boolean`. In dev a tainted declaration fails its module's transform with the diagnostic
  while the live plan keeps the rest linkable.
- `linkedPlan: true` writes `q-linked-plan.server.json` and `q-linked-plan.browser.json` beside the
  bundles from the live plans: the `LinkedPlan` verbatim with root-relative paths (reusing the
  library-plan relocation), only from a complete link, fail closed. Every envelope (module, linked,
  library) resets to `version: 1` under one `PLAN_SCHEMA_VERSION`. `readLinkedPlan(source)` ships as
  the validator and enforces "complete implies no reachable error".
- Gate: `linked-plan-artifact.unit.ts` links the registry complete for both environments,
  serializes, and in a child Node process reads, validates, deep-freezes and runs the matching
  generator; byte-equal to the in-process run; a shuffled module order yields a byte-identical
  artifact. `linked-build.unit.ts` repeats it over its real Rolldown app builds.

### 9. Constants, stripping, plugins

- Constants from two sources, one machinery (`Predicate` guards on setup ops, render ops and QRL
  uses; `build-constant` IR leaf): derived from `Specialization` (`isServer`, `isBrowser`, `isDev`
  from `@qwik.dev/core/build`; `import.meta.env.SSR` = `isServer`, `.DEV` = `isDev`, `.PROD` = not
  `isDev`), and host-defined (`import.meta.env.<NAME>`, `define`d globals) folded from a
  `Specialization.constants` table qwik-vite fills from Vite env and `define`; without a value the
  read stays a hole, reported under `forbid`.
- Folding happens in the linker's materialize phase: a decided guard inlines the kept arm; the
  dropped arm's QRLs become `delivery: omit` and leave reachability and the artifact; JS generators
  replace the constant's range with the literal (`AssemblyKind.ConstantFold`). A residual guard exists
  only for `BuildMode.Unknown` (the neutral library plan); a complete artifact never contains one.
- Strip lists become `Specialization.strip = { exports, ctxName, regCtxName, eventHandlers }`, filled
  by qwik-vite as today, applied at link to `LinkedQrl.delivery` (`stripped`, `register`,
  `reference`) and export removal. `PluginSnapshot` is deleted.
- Plugins: `native$(jsImpl, { <target>: <implementation> })` in source is the only way to attach a
  native implementation. An imported symbol is claimed by wrapping it in the author's own module;
  packages and the router ship claims by using `native$` in their own source, with `registration`
  implementations for what the engine provides, so core plus router compile with zero user plugins.
  A call to a `native$` declaration is `PluginCall { fnId: 'plugin:<package>:<export>', args }` with
  arg count and async-ness recorded by the linker; the `natives` table records declarations; the
  artifact's `implementations` table carries per-language content; readers fail closed naming the
  missing implementation. `qwik:` internal ops come from receiver-type analysis, never imports. Under
  `forbid`, a server-reachable call to an import with no `native$` declaration and no lowerable body
  is `unclaimed-import`, distinct from `js-hole`.
- Proof: a `constants-sweep` fixture family across every payload carrier × server/browser × dev/prod
  with plan snapshots; one fixture per `delivery` kind; real-app gate on the prod client artifact:
  zero stripped bodies in output text, zero `server$` bodies in client chunks.

### 10. Server holes and the reference interpreter

- Server-reachable is a link-time use-edge fact: setup statements, render expressions,
  `useComputed$`/`useTask$`/`useSerializer$`/custom-hook callback bodies, module-level helpers reached
  from render, lifted local functions called during setup. Client-only code stays JS text.
- Expression vocabulary, in yield order (measured on 2815 real-app holes): (0) `localReadIr` returns
  IR for const/mutable/signal/store/loop locals and module bindings (over half the holes);
  (1) literals, object/array, then unary, binary, logical, conditional, template, index, optional
  chain; (2) calls: `qwik:` ops for the small stdlib surface actually seen (`String`,
  `JSON.stringify`, `console.log`, `.map/.filter/.join`, `Math.*`), `DefCall` for a module-local
  function whose body lowers, `PluginCall` for a `native$` declaration; (3) `await` as an
  expression node with its `_await` restoration point, allowed only inside `FnBody`.
- Statement IR, structured subset only: block, `if`/`else`, `try`/`catch`/`finally`, `return`,
  `throw`, expression statement, assignment to a local, a `.value` or a store member, plus the
  existing declaration arms. Loops and `switch` stay refused. `SetupKind.Js` → `SetupKind.Statement`
  beside its range.
- One `FnBody { params, statements }` for computed, task, hook and lifted-function bodies (the
  `lowerKeyBody` envelope). Delete dead schema: `TaskBody`, `TaskStep`, `QrlBodyKind.Task`,
  `HookBodyKind.Js`. Drop the orphan payloads pushed when IR wins. The always-text payloads
  (parameter patterns, props parts, dynamic css, module helpers) fold into the same IR.
- `Specialization.jsHoles: 'allow' | 'forbid'`; under `forbid` the linker emits `js-hole` (construct
  and range) for every server-reachable hole and it fails completeness. The artifact gate runs
  `forbid` over the e2e apps.
- Reference interpreter at `conformance/interpreter/`: evaluates the whole linked server plan
  (every op incl. Suspense, ErrorBoundary, lanes; setup ops; IR; statement IR; `FnBody`), refuses
  what a native engine refuses, calls the real core runtime through the ABI the generated JS calls
  and renders through the real `renderToString`, evaluates IR with native JavaScript operators.
  Gate: every registry fixture by default, hand-kept refusal allowlist, byte-equal container HTML
  including the state script versus the `generateJsSsr` module. The old `interpret-plan.ts` is not
  ported.

### 11. Boundaries, lanes, carriers

- **ErrorBoundary**: the second instance of the Suspense mechanism. `OpKind.ErrorBoundary { content,
fallback, onError, lifetime }`; runtime `createErrorBoundary` (CSR: a content range with an owner)
  and `createSsrErrorBoundary` (SSR: a child lane; failure discards the lane and renders the fallback
  in place, or delivers the fallback packet when already deferred); errors route to the nearest
  boundary through the owner chain. Contract from main: `fallback$(error, reset)`,
  `onError$(error, info)`, digest in prod; caught: render, task, computed, event-handler (`qerror`)
  and visible-task throws in the subtree; a throwing fallback escalates; build errors are not caught;
  no `useErrorBoundary` hook; reset remounts. Port `error-boundary.spec.tsx` (122 minus "multiple
  containers" and "SSRStream") and `suspense.spec.tsx` (47, Reveal inside) as csr/resume/ssr specs.
- **Reveal**: lexical indices; one `createRevealGroup(order, collapsed, count)` per `<Reveal>` in the
  enclosing render; a Suspense inside a collection row under a Reveal is diagnosed
  (`reveal-dynamic-count`).
- **Lanes (multi-head)**: promises across components resolve in parallel, output commits in document
  order. A lane per suspending boundary: a component whose setup awaits, a component returning a
  promise, a promise child, a projection, an async row. Siblings start eagerly in source order; a
  child behind an ancestor's `await` starts when the continuation reaches it. Root cause today: every
  task drains on the single root lane one at a time (two 50 ms siblings = 100 ms). Isolation without
  remap: (1) lane ids assigned synchronously at creation in source order; (2) `q:id` and `useId`
  counters are lane-local and lane-prefixed; (3) serialization roots, event-attr root references,
  style dedupe and sync-function indices become typed reference chunks the writer numbers in
  document order at materialization; patches stay lane-local and flush in commit order. Shell flush
  stays explicit (in-order prefix up to the first deferred range, later state in packets).
  `blocking` derives from the DOM-nesting table with a `suspense-in-order` warning naming the
  element. Fail-fast without a boundary; no concurrency or byte limits. Gate: permuting promise
  resolution yields byte-identical HTML and state; the two 50 ms siblings render in 50 ms; the 20
  existing suspense/streaming e2e tests plus main's out-of-order describes.
- **Carriers**: for an element-less root that registers events, the SSR generator emits an inline
  `<script hidden>` open-tag record at the component's position; the runtime fills it through the
  existing `appendEvent` splice; `relocateHeadlessCarriers` and its helpers are deleted. An RCDATA or
  raw-text parent is diagnosed (`headless-carrier-context`). Carriers commit with their lane. The
  README ledger is corrected.

### 12. Spec

`specs/linked-plan.md`, "Linked plan: the engine contract", replaces specs 01/02/03/07/08/09;
`specs/README.md` indexes it, the three freeze specs (renamed by title, numbers dropped) and the
outlook. Eight rule-only sections, each tied to its gate: envelope and artifacts; completeness;
reachability and holes; IR vocabulary with every variant listed and "fail loudly on anything not
here"; render ops incl. Suspense, Reveal, ErrorBoundary, lanes, in-order propagation; engine
responsibilities by reference to the freeze specs; conformance the compiler provides; plugins.
Carried verbatim: spec 07's QRL invocation convention and request lifecycle as the reference
engine's ABI, spec 09's dependency convention, spec 08's layer0 description. Not carried: spec 07's
"no interpreter" shape. A schema PR that adds or removes a variant must touch the variant tables.
Written once steps 8 and 10 land.

## Not planned here

Execution work with no open decision: library-mode transform of custom `$` APIs, manifests and
chunk graphs and QRL identity in real builds, cold browser resume with unloaded chunks; the
checklist leftovers in groups 9/10/12 (locators after parser normalization, `q:shadowRoot`, `useOn`
on dynamic roots, the skipped `visible-task` decisions, main's `use-task` corpus).
