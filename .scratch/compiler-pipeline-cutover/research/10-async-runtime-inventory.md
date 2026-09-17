# Async runtime inventory (v3 core vs main), 2026-09-17

Ticket: `issues/10-async-runtime-inventory.md`. Sources: `packages/qwik/src/{core,server}` on `v3`,
`packages/compiler/{pipeline,generators,src}` on `v3`, `git show main:` for main. All line numbers
are from the v3 working tree at the time of writing.

## Summary table

| Feature | v3 core | Pipeline compiler emits | Legacy compiler emits | main specs |
| --- | --- | --- | --- | --- |
| Suspense (CSR) | exists | nothing (ordinary `createComponent(Suspense,…)` → renders null) | `createSuspense(...)` | `suspense.spec.tsx` 47 |
| Suspense (SSR, `<!d=` ranges, packets) | exists | nothing | `createSsrSuspense(...)` | `suspense.spec.tsx` |
| `$serializeNext$` / `q:sub` / `registerStateScripts` | exists | n/a (runtime) | n/a | (covered inside suspense/error specs) |
| Reveal | exists (runtime group), marker is a null component | nothing | `createRevealGroup(...)` | `suspense.spec.tsx` (Reveal describe) |
| ErrorBoundary / `useErrorBoundary` | missing | nothing | nothing | `error-boundary.spec.tsx` 122 |
| Thrown-promise retry | exists | n/a | n/a | `render-promise.spec.tsx` 4 |
| Async components / promise JSX | exists | emitters already `maybeThen`/defer | same | `render-promise`, `render-api` |
| Streaming writer + chunk boundaries | exists (out-of-order packets, backpatch, sync fns) | n/a | n/a | `ssr-render.spec.tsx` 11, `render-api.spec.tsx` 52 |
| Resource / `SSRStream` / `SSRRaw` / `SSRComment` | missing | nothing | nothing | `use-resource.spec.tsx` 9 |

Key finding: the runtime half of group 13 is already built and unit-tested on v3; the gap is in
`packages/compiler/pipeline`, which has a `OpKind.Suspense` schema entry that nothing produces or
emits. The legacy `generators/js/{csr,ssr}` already emit the exact runtime ABI, so the pipeline work
is a port, not a design.

## Suspense

**Status: exists on v3 (runtime); pipeline: missing (schema only).**

Entry symbols (v3):

- `Suspense` marker: `packages/qwik/src/core/dom/content/content.ts:62` (`() => null`; props
  `SuspenseProps { fallback$?, delay? }` at `:56`). Exported from `core/index.ts:333,340`.
- `createSuspense(ctx, range: BranchRange, contentQrl, fallbackQrl?, delay=0, group?, index=0)`:
  `content.ts:290`. Builds a `ContentBlock` (`content.ts:143`, `createContentBlock` `:267`), runs
  the subscription once, races a `setTimeout(delay)` against the promise, renders the fallback in a
  child owner stored as `block.currentOwner` (`:371`), disposes it on commit (`:336`). Exactly the
  8-step algorithm in `MULTI_HEAD_SSR.md` "CSR ABI", plus the `RevealGroup` hold (`holdForReveal`,
  `:311-325`). Exported `core/index.ts:336`.
- `createSsrSuspense(host: SsrRangeHost, rangeId, contentQrl, fallbackQrl?, delay=0, group?, index=0)`:
  `packages/qwik/src/core/dom/content/suspense-ssr.ts:39`. Uses `host.createRangeScope(rangeId)` (a
  child lane), `scope.flush()` for the initial task flush, `settleInline` when content wins, else
  `scope.defer(range, content)` + `renderFallback()`; `delay > 0` races a timer (`:120-150`).
  Falls back to awaiting in place when `!host.canDefer` (in-order). Exported `core/index.ts:343`.
- `SsrRangeHost` / `SsrRangeScope` interfaces: `suspense-ssr.ts:14-33`; the engine implements them
  in `SsrRenderContext` (`packages/qwik/src/server/ssr-render.ts:66-88`).
- `<!d=N>…<!/d>` range markers: `ssr-render.ts:175-179` (`wrapContent`), also emitted by slots for
  deferred projections at `packages/qwik/src/core/dom/slot/slot.ts:380`.
- Deferred record + packet loop: `SsrDeferredRange` `packages/qwik/src/core/ssr/output.ts:31-46`,
  `DeferredRange` (adds `lane`) `ssr-render.ts:93-95`, `scope.defer` `ssr-render.ts:203-226`,
  packet writer loop `ssr-render.ts:447-527` (parent-before-child, `canEmit` gate, resolution
  order, cancellation of ranges whose owner died with the fallback `:507-522`).
- Packet scripts: `SsrScriptEmitter.emitSuspenseRuntime` (the `_qwikS` executor, tree-walks the
  `d=`/`/d` comments, `Range.deleteContents()` + `insertNode(template.content)`, calls
  `registerStateScripts`/`disposeRoot`/`prepareRoot` on `container._ctx`)
  `packages/qwik/src/server/ssr-script-emitter.ts:182`, `emitResolved` (`<template q:s=…>` + call)
  `:189`, `emitStateRange` (`q:s`/`q:base`/`q:len`, plus the zero-root `q:sub` chunk) `:71-110`.
- `$serializeNext$(): Promise<SerializedStateRange | null>`:
  `packages/qwik/src/core/shared/serdes/serialization-context.ts:146` (interface `:22-37`).
  Consumed at `ssr-render.ts:479`; `collectDeferredSubscriptions` feeds the `q:sub` pairs.
- Client `registerStateScripts` (idempotent, `q:sub` aware):
  `packages/qwik/src/core/runtime/container-context.ts:54,134,168-215`.
- `blockingSuspense` on component ops is set `false` everywhere (`pipeline/analyse/lower-jsx.ts:879`).

v3 tests covering it (all green, none skipped):

- `packages/qwik/src/core/dom/content/content.unit.ts` — 20 its; describes `ContentBlock`,
  `createSuspense`.
- `packages/qwik/src/core/dom/content/reveal.unit.ts` — 4 its; `reveal groups` (drives
  `createSuspense` with a group).
- `packages/qwik/src/server/ssr-render.unit.ts` — 39 its; `SSR context markers`, `deterministic
  rendering`; ~17 of them call `createSsrSuspense` directly (`:431-1055`), asserting `<!d=0>`,
  `q:sub` presence/absence, packet order, nested ranges, delay race, in-order fallback.
- `packages/qwik/src/core/runtime/container-context.unit.ts` — 20 its (`registerStateScripts`,
  append-only `q:base`, `q:sub` edges, packet state via `$serializeNext$`).
- `packages/qwik/src/core/serdes.unit.ts:317-337` — `$serializeNext$` empty/second-range cases.
- `packages/qwik/src/server/ssr-scheduler.unit.ts` — 8 its (lanes, cancel, patches).
- `packages/qwik/src/core/dom/ssr-boundaries.unit.ts` — 12 its.
- Corpus (through the pipeline via `qwik-vite/src/plugins/test-resume.ts`):
  `packages/qwik/src/core/tests/task.spec.tsx:138-170` `renders fallback while initial task work is
  pending` (`it.runIf(csrRender)`, uses `<Suspense fallback$=…>`) — this is the "known Suspense
  red" cited in `JSX-IMPLEMENTATION.md:671,683,699,712`: the pipeline lowers `<Suspense>` as an
  ordinary component whose render is `() => null`, so nothing renders.
- `packages/qwik/src/core/tests/deferred-features.spec.ts` — `describe.skip`, 3 placeholder its
  (`Resource`, `ErrorBoundary`, `Suspense and out-of-order streaming`) that only hold source text.
- e2e (legacy dev compiler path per `research/audit-2026-09-17.md`): `e2e/qwik-e2e/tests/suspense.e2e.ts`
  16 tests, `streaming.e2e.ts` 4 tests, none skipped; app at
  `e2e/qwik-e2e/apps/e2e/src/components/suspense/suspense.tsx`.

What the pipeline compiler has:

- `OpKind.Suspense = 'suspense'` `packages/compiler/pipeline/schema/program.ts:53`, op shape `:188-196`
  (`content: ProgramId, contentId, fallback: ProgramId | Value | null, fallbackId, delay, blocking,
  lifetime, reveal?: {group, order, collapsed, index, count}`); `LifetimeOwner.Suspense`
  `schema/shared.ts:257`.
- Consumers that already walk it: `link/render-results.ts:230`, `link/qrl-dependencies.ts:274`.
- No producer: `analyse/lower-jsx.ts` only recognizes `Slot` via `ctx.coreBindings` (`:167,1164`);
  `Suspense`/`Reveal` fall through to the component path (`createComponent(Reveal, null, ctx, …)` in
  `pipeline/tests/snapshots/local-functions.csr.snap:77`, `.ssr.snap:241`).
- No emitter: `generate/js-csr.ts` and `generate/js-ssr.ts` `switch (op.op)` blocks (csr `:302-315,
  484-512, 610-614, 1206-1230`; ssr `:524-560, 670-719`) have no `OpKind.Suspense` case. `grep -i
  suspense generate/` only hits `deferRenderAfterTasks` (`emit-setup.ts:233`), which is task
  deferral, not Suspense.
- No pipeline test mentions `Suspense` (only the `Reveal` import in `snapshots.unit.ts:2984-2998`,
  where it is a stand-in for any component).

What the legacy compiler emits (the ABI the pipeline must reproduce):

- CSR: `generators/js/csr/emit-csr.ts:1189-1215` —
  `createSuspense(ctx, new BranchRange(ctx.document, start, end), contentFn, fallback, delay[, group, index])`,
  preceded by `const groupN = createRevealGroup(order, collapsed, count);` when in a `<Reveal>`.
- SSR: `generators/js/ssr/emit-js.ts:1544-1566` —
  `createSsrSuspense(ctx, idVar, contentQrl, fallbackQrl, delay[, group, index])`.
- Extraction: `src/extract.ts:179,1243` (`isSuspense`), plan `src/plan-types.ts:398-415`
  (`SuspensePlan`, `SuspenseRevealPlan`), SSR plan `src/plan-ssr.ts:191`, linker
  `src/link-plan.ts:280`, `src/emit-plan-ssr.ts:900`.

## Reveal

**Status: exists on v3 (runtime); pipeline: missing.**

- `Reveal` marker (`() => null`), `RevealProps { order?: 'parallel'|'sequential'|'reverse'|'together', collapsed? }`:
  `packages/qwik/src/core/dom/content/reveal.ts:4-18`.
- `RevealGroup` class (`canReveal`, `mayShowFallback`, `whenRevealable`, `resolve`) `reveal.ts:24-83`;
  `createRevealGroup(order?, collapsed?, count=0)` `:86`. Exported `core/index.ts:348-352`.
- Consumers: `createSuspense` (`content.ts:296,311-325,349-352`) and `createSsrSuspense`
  (`suspense-ssr.ts:70,89-91,101`). Both engines gate emission through `range.canEmit`/`onEmitted`/
  `onCancelled` (`ssr-render.ts:457-460,505,517`).
- Tests: `reveal.unit.ts` (4), `ssr-render.unit.ts` (group ordering cases around `:770-870`).
- Pipeline: the `reveal?` field on the `Suspense` op exists (`schema/program.ts:195`) but nothing
  fills it; legacy emits it (`emit-csr.ts:1205-1207`, `emit-js.ts:1556-1558`).
- Contrast with main: main's `Reveal` is a real `componentQrl` with context registration
  (`main:packages/qwik/src/core/control-flow/reveal.tsx:61-158` — `revealCanReveal`,
  `useRevealBoundary`, `revealCmp`) and `suspense.tsx:74-201` (`suspenseTask`, `suspenseCmp`).
  v3 replaces both with compile-time lexical indices, per `MULTI_HEAD_SSR.md`.

## ErrorBoundary / useErrorBoundary

**Status: missing on v3 (runtime and compiler).**

- No `ErrorBoundary`, `useErrorBoundary`, `ErrorBoundaryPhase`, or `error-boundary*.ts` under
  `packages/qwik/src/core` on v3; `core/index.ts` exports none. Only hit is the skipped placeholder
  `tests/deferred-features.spec.ts:15-23`.
- Current failure path: CSR — `createComponentAttempt` disposes the owner and rethrows
  (`component/component.ts:120-126`), scheduler surfaces via `qerror` (per `JSX-IMPLEMENTATION.md:670`);
  SSR — `SsrScheduler.fail()`/`throwIfFailed()` (`server/ssr-scheduler.ts:67,178,201,243,247`) and
  `deferredError`/`throwDeferredError` (`ssr-render.ts:212-224,364-383`) fail the whole request.
  This is the "without a boundary the render keeps rejecting as it does now" state in group 13.
- main entry: `main:packages/qwik/src/core/shared/error/error-boundary.ts` (`ErrorBoundaryProps :53`,
  `errorBoundaryReset :75`, `resetErrorBoundary :88`, `errorBoundaryCmp :201`, `ErrorBoundary :243`,
  `SSRErrorFallbackHost :309`), `error-boundary-phase.ts`, `error-handling.ts`,
  `ssr/error-boundary-ssr.ts`, `use/use-error-boundary-store.ts` (`useErrorBoundaryStore :9`,
  not re-exported from `index.ts`). main `index.ts:161-168` exports `ErrorBoundary`, `_ebC`, `_ebR`,
  `ErrorBoundaryPhase`, `ErrorBoundaryInfo`. main never exports a `useErrorBoundary` hook; the
  ticket's name refers to the group 13 target, not a main symbol.
- Pipeline/legacy compiler: zero mentions of `ErrorBoundary` in `pipeline/` or `generators/`.

## Thrown-promise handling / retry

**Status: exists on v3.**

- Components: `createComponentAttempt` catches a thrown promise, awaits it and re-invokes with the
  parent context up to `MAX_RETRY_ON_PROMISE_COUNT` (`component/component.ts:103-134`); async
  render results go through `nodes.then(finalizeOutput, retryOnPending)` (`:132`).
- Generic helper `retryOnPromise(fn, onError)` `shared/utils/promises.ts:69-115`; used by branch
  conditions (`dom/branch/branch.ts:124,155,225`), content blocks (`dom/content/content.ts:175,436`),
  DOM/SSR effects (`dom/effect/dom-effect.ts:40`, `ssr-effect.ts:101,330,350,382,399`), and event
  handlers (`core/handlers.ts:50`).
- Group 13 item "retry without duplicate initialization or projection" is not separately tested on
  v3; the comment at `component.ts:103-107` notes the failed attempt's owner is intentionally left
  undisposed.
- main: `render-promise.spec.tsx` (4 its) is the closest corpus.

## Async components / promise JSX

**Status: exists on v3.**

- Runtime: `createComponent` accepts a promise render result (`component.ts:132`);
  `renderSsrDynamicContent` / `createDynamicContent` (`content.ts:68,91`) resolve promises, arrays
  and callbacks; `escapeSsrContent` `:116`.
- Emitters: `deferRenderAfterTasks` (`generate/emit-setup.ts:233`, used `js-csr.ts:208`,
  `js-ssr.ts:346`) already defers a render behind pending setup work; ops use `maybeThen`.
- Corpus on v3: `tests/async-signal.spec.tsx` (16 its, `${name}: async signals`),
  `tests/jsx-async.spec.tsx` (1 it, `${name}: async JSX callbacks`), `projection.spec.tsx:1402`
  (`#7000` promise into hidden slot). None skipped.
- Group 13 "async components / promises returning JSX or child arrays" is unchecked in
  `JSX-IMPLEMENTATION.md:604-605`; the runtime path exists, so what is missing is corpus proof
  (main `render-promise.spec.tsx`, `render-api.spec.tsx` async cases).

## Streaming writer + chunk boundaries

**Status: exists on v3.**

- Entry: `renderToStreamCompiled(root, opts, outOfOrder = opts.outOfOrder !== false)`
  `server/ssr-render.ts:120`; `renderToStringCompiled` `:104`; public aliases `:559-561`.
- Writer: `SsrOutputWriter` (`core/ssr/output-writer.ts:14`) materializes `SsrOutput` records
  (`SsrRecordChunk`, `SsrReferenceChunk`, `SsrEventAttrChunk` from `core/ssr/output.ts:1-24`) into
  `opts.stream.write(chunk)` (`ssr-render.ts:318-325`); `StringWriter` `server/string-writer.ts:1`.
- Chunk boundaries (each is one `writer.finish`/`flush` call): container open `:407`, styled shell
  `:409`, shell tail (state script, qwikloader, events, `_qwikS` runtime when deferred) `:419-444`,
  one packet per resolved range `:481-502`, backpatch scripts between packets `:452-455`, container
  close `:526`. `flush()` prepends pending `sync$` definitions `:364-378`.
- Lanes: `SsrScheduler`/`SsrLane` `server/ssr-scheduler.ts:25,74` (`createLane`, `cancel`,
  `flush`, `takePatches`); `blockedLanes` keeps patches for an un-emitted range inside its packet
  (`ssr-render.ts:326-360`).
- In-order mode: `ctx.inOrder()` sets `canDefer = false` (`ssr-render.ts:290-296`) so
  `createSsrSuspense` awaits inline (`suspense-ssr.ts:75-80`).
- Missing vs main: `SSRStream`, `SSRStreamBlock`, `SSRRaw`, `SSRComment`, generator/writer
  callbacks (main `index.ts:64-74`) have no v3 counterpart (group 14 item).
- Tests: `ssr-render.unit.ts` (39), `ssr-scheduler.unit.ts` (8), `output-writer.unit.ts`,
  `ssr-script-emitter.unit.ts`; e2e `streaming.e2e.ts` (4).

## Resource / SSRStream (adjacent, group 14)

**Status: missing on v3.** No `useResource`, `Resource`, `SSRStream`, `SSRRaw`, `SSRComment` under
`packages/qwik/src/{core,server}` (only the skipped placeholder in `deferred-features.spec.ts:4`).
main: `use/use-resource.ts`, `use/use-resource-dollar.ts`, `index.ts:145-155`.

## main spec table

Files under `main:packages/qwik/src/core/tests` matching `suspense|reveal|error|resource|stream|async`,
plus the adjacent render/stream specs. `its` counts `it(`/`test(` lines including `.skip`.

| main file | its | skipped | top-level describes | on v3? |
| --- | --- | --- | --- | --- |
| `tests/suspense.spec.tsx` | 47 | 1 | `describe.each(...)` (`:86`), `ssrRenderToDom: Reveal suspense coordination`, `domRender: Suspense client-side pause delay`, `ssrRenderToDom: out-of-order Suspense`, `ssrRenderToDom: author re-render across a deferred Suspense` | no (only `task.spec.tsx:138` + `deferred-features.spec.ts` placeholder, skipped) |
| `tests/error-boundary.spec.tsx` | 122 | 1 (`:1251` late-delivery attribute tracking) | `ErrorBoundary + fallback$` (SSR only / CSR only / last-resort fallback / hostile thrown values / SSR delivery & teardown / in-place swap (qErr) / out-of-order streaming (Suspense) / late-delivered fallback / stateless wire / after resume / two-host collapse / inert subtree / re-derivation / integration / Slot projection / tasks / visible tasks / computeds / function children / SSRStream / qerror routing / multiple containers), `onError$`, `ErrorBoundary reset` (nested boundaries / reset inside outer fallback / through wrapper components), `transformError (render option)` | no (placeholder only, skipped) |
| `tests/error-handling.spec.tsx` | 1 | 0 | — | no |
| `tests/error-provider.spec.tsx` | 4 | 0 | — | no |
| `tests/use-resource.spec.tsx` | 9 | 0 | — | no (placeholder only, skipped) |
| `tests/render-promise.spec.tsx` (adjacent: async/thrown promise) | 4 | 0 | — | no; nearest v3: `jsx-async.spec.tsx` (1), `async-signal.spec.tsx` (16) |
| `tests/ssr-render.spec.tsx` (adjacent: streaming) | 11 | 0 | `v2 ssr render` | no |
| `tests/render-api.spec.tsx` (adjacent: stream API) | 52 | 0 | `render api` | no |
| `server/ssr-stream-handler.unit.ts` | 1 | 0 | `StreamHandler` | no (v3 has `ssr-render.unit.ts` 39) |
| `server/ssr-container.spec.ts` | 10 | 0 | `SSR Container` | no |
| `shared/error/error-boundary.unit.tsx` | 5 | 0 | — | no |

No main spec file name matches `reveal`, `stream` or `async` directly; Reveal lives inside
`suspense.spec.tsx`, streaming inside `ssr-render`/`render-api`/`error-boundary` (out-of-order
describes).

v3 spec files matching the same regex: `async-signal.spec.tsx` (16, green), `jsx-async.spec.tsx`
(1, green), `deferred-features.spec.ts` (3, `describe.skip`).

## Answer

1. Suspense/Reveal/streaming/`$serializeNext$`/`q:sub` runtime is complete on v3 (`dom/content/{content,suspense-ssr,reveal}.ts`, `server/ssr-render.ts`, `ssr-script-emitter.ts`, `container-context.ts`) with ~110 green unit its; ErrorBoundary and Resource/SSRStream are absent.
2. The pipeline has only the `OpKind.Suspense` schema + two linker walkers; `lower-jsx` recognizes just `Slot`, so `<Suspense>`/`<Reveal>` compile to `createComponent(() => null)` — the "known Suspense red" (`task.spec.tsx:138`).
3. Legacy `generators/js/{csr,ssr}` (`emit-csr.ts:1189`, `emit-js.ts:1544`) already emit the exact `createSuspense`/`createSsrSuspense`/`createRevealGroup` ABI; the pipeline needs a producer in analyse and an emitter case per target.
4. Thrown-promise retry (`component.ts:103`, `retryOnPromise`) and async component results exist; they lack corpus proof (main `render-promise.spec.tsx` 4).
5. main corpus to port: `suspense.spec.tsx` 47, `error-boundary.spec.tsx` 122 (1 skip), `use-resource.spec.tsx` 9, `error-handling` 1, `error-provider` 4; v3 has none of these, only skipped placeholders in `deferred-features.spec.ts`.
