# Map: compiler pipeline cutover

Tracker: local markdown. Tickets live in `issues/NN-<slug>.md`; research findings in `research/<slug>.md`.

## Destination

Legacy `packages/compiler/src` is deleted and the staged `pipeline/` is the only compiler in dev
and production builds, with today's green suites still green. Suspense, Reveal, ErrorBoundary,
multi-head SSR and out-of-order streaming for Suspense work on it. The server `LinkedPlan` is
written as a whole-app JSON artifact with no `Js` bodies reachable from the server, proven by a
fresh-process regeneration gate, so a native generator or interpreter can be built from it
without further compiler changes.

## Notes

- Domain: Qwik v3 compiler (`packages/compiler/pipeline`), qwik-vite hosts, core runtime cutover.
- Skills every session loads: `qwik-core-development` for runtime, `qwik-e2e-verification` for
  gates, `mattpocock-skills:grilling` + `domain-modeling` for decision tickets.
- Standing decisions (2026-09-17, Varixo): no-holes wins over DESIGN rule 5 for server-reachable
  bodies; plan format stays engine-agnostic (interpreter vs generator not decided here); old
  native artifacts (`generators/rust/ssr`, `conformance/layerA`, specs 01/02/03/07/08/09,
  `REQUIREMENTS.md`) die with legacy, `conformance/layer0` and specs 04/05/06/10 survive; core
  runtime legacy-only code is deleted in this map; coverage contract is snapshots + core behavior
  specs + unit tests for pure helpers + a schema-variant coverage gate, not per-file tests;
  architecture bar is single responsibility, not a line ceiling; cutover needs no extra gate
  beyond no regression against today's green suites (legacy was never finished).
- Older standing rules still apply: no legacy accommodation, seeds adopt staged formatting,
  flat SSR output when possible, QRL extraction follows the ts-optimizer conventions.
- Audit inputs (2026-09-17) are summarized in `research/audit-*.md`.

## Route (all decisions made, 2026-09-17)

Execution order implied by the resolved tickets; each step's detail is in its ticket.

1. Fix the render-results recursion (21) and the silent non-extraction shapes (22).
2. Absorb the five legacy modules and add the eslint guard (01); move `extractRenderRoots` (02).
3. Port Suspense onto the existing op and runtime ABI (08, Suspense half).
4. Flip `plugin.ts` to the pipeline `transformModules`, apply the delete list, `git mv pipeline src` (02);
   bar per 02 and the sweep.
5. Responsibility-map splits, pure moves (12); `lower-hole.ts` → `lower-text.ts` (13).
6. Test contract: snapshot split, fixture registries, plan snapshots, coverage gate, `compiler` project (11).
7. Live-plan dev host `createLinkedApp()` with TypeScript `LanguageService` reuse (04).
8. Per-declaration taint and reachable-failure completeness (18); artifacts + `readLinkedPlan` (05).
9. Build constants, `Specialization.strip`, delete `PluginSnapshot` (26); `native$` as `PluginCall` (25).
10. Server-hole IR: `localReadIr`, literals/operators, calls, `await`, statement IR, `FnBody`,
    `jsHoles: 'forbid'` (07); reference interpreter in `conformance/interpreter/` (24).
11. ErrorBoundary as the second range-plus-lane boundary; Reveal groups (08); lanes and write-time
    numbering for multi-head (09); static inline carriers for element-less roots (23).
12. `specs/linked-plan.md` and the spec index (14); glossary already at `packages/compiler/CONTEXT.md` (13).

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->
- [Which layerA fixtures are worth porting](issues/03-layera-fixture-salvage.md): 55/58 accepted, 31 duplicate existing snapshots; salvage 13 (unary/index/undef text, if-setup, imported callback, local-component family, signal identity, fragment root, dynamic tag, visible-task-static); 3 refused (captured local component in a branch arm, async component) and 8 silent pass-throughs (`jsx()` calls, `native$`) become todo regressions.
- [Core runtime code that only legacy output uses](issues/15-core-legacy-runtime-inventory.md): the record layer is NOT legacy-only (pipeline emits `createSsrOpenTag`/`createSsrMarkup` for `useOn*` roots, spreads and dynamic events; headless carrier relocation is the only path for element-less roots) so keep it and fix README's stale "records die at cutover" ledger; genuinely dead in core: `createDomBatchEffect`, `patchTextValue`, `getPropSource`/`getMemberSource` plus two stray index exports; `extractRenderRoots` is a straight move (research 16: ~215 lines in `src/index.ts`, oxc-parser only); `Each`/`Show` already gone, docs still import them; QwikSsrPlan consumers live only in qwik-vite and e2e native scripts.
- [What the core runtime already has for async rendering](issues/10-async-runtime-inventory.md): Suspense, Reveal, streaming packets, `$serializeNext$`/`q:sub` all exist on v3 with ~110 green unit its; the pipeline only has the `OpKind.Suspense` schema and no analyse producer or emitter case, so `<Suspense>` compiles to a null component (the known red); legacy generators emit the exact runtime ABI, so group 13 is a port. ErrorBoundary is absent entirely (main has `ErrorBoundary`, no `useErrorBoundary` hook; 122 specs). Thrown-promise retry exists unproven. main corpus to port: suspense 47, error-boundary 122, render-promise 4, ssr-render 11, render-api 52.
- [Inventory of every producer of Js bodies](issues/06-js-body-inventory.md): one producer per kind — `QrlBodyKind.Js` at `lowerFunctionQrl` (every inline `$` function: handlers, `$()`/`use*$` callbacks, lifted locals, `*$` props, `sync$`; 74 fixtures), `SetupKind.Js` at `lowerJsStatement` (any non-declaration setup statement; 11 fixtures), `HookBodyKind.Js` and `QrlBodyKind.Task` have zero producers. A fourth hole dominates: `ExprKind.Js` for anything outside the literal/identifier/member IR subset (480 hits, 121 fixtures). All print through `extractPayloadJs` (range slice + hole splicing); a Payload is a source range plus hole table, IR lives inside holes, never beside. Orphan payloads are pushed even when IR wins.
- [Absorb the five legacy modules the pipeline still imports](issues/01-absorb-legacy-modules.md): `expr-ir` → `schema/value-ir.ts` on `LocalId` minus the seven never-produced call/plugin/lambda variants, no `build-constant` leaf yet; range mapper + node source map → root `source-maps.ts`; magic-string assembly folds into `generate/assemble-module.ts`; `applyReplacements` private in `emit-chunk`; `compat/` renamed `pipeline/transform-modules.ts` as the host entry; eslint bans `../src` from `pipeline/**`; snapshots byte-unchanged are the pin.
- [Cutover prerequisites: acceptance sweep and render-root port sizing](issues/16-cutover-prerequisites-sizing.md): 911 real app files, 34 rejected (e2e 9 of 436, down from 103); one real compiler bug (`render-results` recursion overflow on self-referential assignment), 15 insights icons with a second component parameter, and 5 files that silently keep `component$(` (factories inside plain functions, `jsx()` loop roots, Suspense). `extractRenderRoots` is ~215 lines in `src/index.ts` on `oxc-parser` only, a straight move with 4 pinned tests.
- [Contents and bar of the cutover commit](issues/02-cutover-commit.md): a series on one branch (absorb → move render roots → flip `plugin.ts` + delete → `git mv pipeline src`), one PR, no flag; delete list covers legacy src, generators, layerA, old specs/plans, `ssrPlan` plumbing, native crates, native scripts and CI jobs, four dead core symbols; flat exports after; bar = no regression vs recorded `vitest run packages`, chromium + qwik-react e2e, `tsc.check`, `build.full`, and zero sweep rejects on e2e apps.
- [Cost of a full whole-app relink and regenerate](issues/17-relink-cost.md): with cached plans, docs (333 files) ≈250 ms and e2e (401) ≈330 ms per environment; ≈100 ms of every link is a fresh TypeScript program in `type-results`, the rest render-result evaluation; generate ≈35 µs per emitted module; one per-module transform ≈1–6 ms. `complete:true` currently fails on both sets because any module diagnostic becomes `non-portable-export`.
- [Dev builds: one live LinkedPlan with module swap-in](issues/04-incremental-relink-design.md): per-file `ModulePlan` cache, full relink + regenerate on every swap, output hash diff drives Vite invalidation; seen-set link with an eager SSR-entry crawl; TypeScript `LanguageService` replaces the per-link program; two live plans (server, browser); compiler-owned `createLinkedApp()` shared by dev and `linked-build.ts`; per-module `transformModules` stays for tests and library API only.
- [Whole-app LinkedPlan JSON artifact](issues/05-plan-artifact-contract.md): `linkedPlan: true` writes `q-linked-plan.server.json` and `q-linked-plan.browser.json` from the live plans; verbatim `LinkedPlan` with root-relative paths; only from a complete link, fail closed; each proven by its own generator in a fresh Node process (byte-equal, shuffle-stable) in a compiler unit and in `linked-build.unit.ts`; all envelopes reset to version 1 under one `PLAN_SCHEMA_VERSION`; `readLinkedPlan` ships as the validator.
- [Server-reachable hole constructs by frequency](issues/19-hole-constructs-by-frequency.md): 456 fixture / 2815 real-app server-reachable holes; over half are bare identifiers or member chains the IR already accepts but `localReadIr` refuses for const/mutable/signal/store/loop locals and module bindings; then object/array literals, then operators (all have unproduced `ValueIrKind` arms); calls are mostly `$`-family router markers, module helpers, `String`/`JSON.stringify`, `console.log`; statements are `const`/`if`/`.value =`/`store.x =`/`return {…}`/`cleanup()`; `await` in 3 % of holes, never in render or setup.
- [What replaces each server-reachable Js body](issues/07-server-holes-replacement.md): server-reachable is a link-time use-edge fact; all client-only code stays JS text; lowered bodies carry IR beside the authored range so JS generators keep slicing text and a test reference interpreter proves IR fidelity by identical HTML; vocabulary lands `localReadIr` first, then literals/operators, then `qwik:`/`DefCall`/`PluginCall` calls, then `await` inside `FnBody`; a structured statement IR (no loops); one `FnBody` for all callable bodies, dead task/hook arms deleted; `Specialization.jsHoles: 'forbid'` makes every server hole a `js-hole` diagnostic that fails completeness.
- [Compiler contract for Suspense, Reveal and ErrorBoundary](issues/08-suspense-reveal-errorboundary-lowering.md): Suspense is a port onto the existing op and runtime ABI; Reveal uses lexical group indices and diagnoses dynamic counts; ErrorBoundary is a second range-plus-lane boundary (`OpKind.ErrorBoundary`, `createErrorBoundary`/`createSsrErrorBoundary`, owner-chain routing) with main's `fallback$(error, reset)`/`onError$` contract and no hook; reset remounts; thrown promises stay retry-supported; port main's suspense (47) and error-boundary (122) corpora.
- [Does staged SSR already run sibling async work concurrently, and is the output deterministic?](issues/20-ssr-parallelism-and-determinism.md): no and no. Render steps start eagerly, but every task lands on the single root lane which drains one task at a time, so two 50 ms task siblings take 100 ms (promise-returning components and async computeds do overlap). Every id (`nextId`, roots, `useId`, style/event order, sync tables, patches) is assigned at render time in execution order and the writer never remaps, so permuted resolution already changes bytes in the async-computed case.
- [Multi-head SSR and out-of-order streaming for Suspense](issues/09-multihead-ooo-streaming.md): generic multi-head is in: a lane per suspending boundary (async setup, promise component, promise child, projection, async row), siblings start eagerly, commit in document order; isolation without remap: head ids in source order, head-prefixed `q:id`/`useId`, and write-time numbering of roots/events/styles/sync tables via typed reference chunks; permuted resolution must be byte-identical; shell flush stays explicit; `blocking` from the DOM-nesting table with a `suspense-in-order` warning; fail-fast without a boundary; no limits.
- [Snapshot split, schema-variant coverage gate, compiler vitest project](issues/11-test-contract-shape.md): snapshot suite split by construct family with snap names unchanged; fixtures become exported registries shared by snapshots, the artifact gate, the variant-coverage gate and the reference interpreter; coverage gate reads schema enums from source and fails on unproduced values outside a hand-kept allowlist; a third `<name>.plan.snap` per fixture holds the linked server plan; no `test.todo` survives; direct unit tests only for pure helpers; named `compiler` vitest project plus `test.compiler` script.
- [File responsibility map for pipeline/](issues/12-responsibility-map.md): generators split by op family per target over an explicit emitter context (two dispatchers, shared leaves); `emit-chunk` into printer / qrl-chunks / captures; `lower-jsx` into element / component / children / projection / render-qrl; `lower-setup` splits off setup calls; the two linker closures become phase files with `linkPlans` as orchestrator; duplicate `names.ts` merged, the two `type-results.ts` renamed; pure moves gated by byte-unchanged snapshots, sequenced after cutover and before feature work; README layout table is the enforcement.
- [CONTEXT.md glossary for the compiler](issues/13-glossary.md): written at `packages/compiler/CONTEXT.md`; hole = payload sense, text hole = JSX sense (`lower-hole.ts` → `lower-text.ts`); lane replaces head; segment = wire identity, chunk = emitted file, program = lowered render body; target-native, hydration and legacy vocabulary retired.
- [What fails a complete link](issues/18-what-fails-completeness.md): refusals taint one declaration, never a module; `analyseModule` never throws; completeness fails only on reachable failures (dangling/unresolved edges, failed export roots, tainted declarations, server holes under `forbid`); diagnostics carry `reachable`; `readLinkedPlan` enforces it; dev fails the tainted module's transform without cascading.
- [One native-contract spec over LinkedPlan](issues/14-native-contract-spec.md): `specs/linked-plan.md` replaces 01/02/03/07/08/09 with eight rule-only sections tied to their gates; freeze specs renamed by title, numbers dropped; engine shape stays open; schema PRs must touch the variant tables; written once tickets 05 and 07 land.
- [Exact recursion shape of the render-results overflow](issues/27-recursion-shape.md): `x.value = x.value.<method>(...)` plus a hole reading a suffix of the written property; the write's `invoke-result` prepends `[method, #return]` as an infix, so paths grow strictly longer and are neither prefixes nor suffixes of any active path; five minimal regression inputs recorded.
- [Self-referential assignment in render results: diagnostic or fixpoint](issues/21-render-results-recursion.md): fixpoint; guard the infix growth in `readBinding` plus a depth cap backstop, both answering `Unknown` silently; five regression inputs.
- [Silent non-extraction](issues/22-silent-non-extraction.md): factory components supported via the payload scan; runtime `jsx()` calls diagnosed fail-closed (one e2e fixture rewritten, edit to be approved); a rollback without a diagnostic fails the compiler's own tests; `event$` gets its `eventQrl` twin; the Suspense port precedes the `plugin.ts` flip.
- [Element-less roots: runtime relocation or static carriers](issues/23-headless-carriers.md): the generator places an inline `<script hidden>` record at the component's position for element-less roots that register events, the runtime fills it via the existing `appendEvent` splice, head relocation is deleted; RCDATA/raw-text parents are diagnosed; carriers commit with their lane.
- [Reference interpreter: scope, home, and the HTML oracle](issues/24-reference-interpreter.md): evaluates the full linked server plan, refuses what a native engine refuses, calls the real core runtime through the generated-JS ABI and the real `renderToString`, lives in `conformance/interpreter/`, gates every registry fixture by byte-equal HTML with a shrinking refusal allowlist; the old interpreter is not ported.
- [How an import becomes a PluginCall claim](issues/25-plugin-claims.md): `native$` in source is the whole plugin system (no manifest field, no vite option); wrapping an import in `native$` claims it, packages and the router ship claims the same way; calls become `PluginCall` with `fnId`, implementations ride the artifact table, readers fail closed; `unclaimed-import` under `forbid`; `qwik:` ops stay receiver-typed, not claims.
- [Build constants and stripping in the linker](issues/26-build-constants-and-stripping.md): `isServer`/`isBrowser`/`isDev` and their `import.meta.env` aliases fold from `Specialization`, other env/define constants fold from a host-supplied table or stay reported holes; guards fold at materialize with dropped arms' QRLs `omit`ted; residual guards only in neutral library plans; strip lists become `Specialization.strip` applied to `delivery`; `PluginSnapshot` deleted; constants-sweep and per-delivery fixtures plus a real-app client-artifact gate.

## Not yet specified

- Group 15 remainder: library-mode transform of custom `$` APIs, manifests/chunk graphs/QRL identity in
  real builds, cold browser resume with genuinely unloaded chunks (execution work on the cutover series,
  no open decision).
- Leftovers in groups 9/10/12 (roadmap items in JSX-IMPLEMENTATION, not decisions): locators after
  parser normalization and `q:shadowRoot`, async collection rows (ride on lanes, ticket 09), `useOn` on
  dynamic roots, the skipped `visible-task` decisions, porting main's `use-task` corpus.

## Out of scope

- Building a native generator or interpreter (Rust/Go/Zig); this map ends at the contract.
- `useResource`, `SSRStream`/`SSRRaw`/`SSRComment`, embedded/multiple containers, React
  external projections: stay as they are or are deprecated (Varixo, Q12).
- Event-only qwikloader optimization.
- `packages/docs` importing removed `Each`/`Show` (8 files): docs drift, breaks independently of cutover; not on the cutover bar.
