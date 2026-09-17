# 20 — Does staged SSR run sibling async work concurrently, and is the output deterministic?

Ticket: `../issues/20-ssr-parallelism-and-determinism.md`. Date: 2026-09-17.

Method: a temporary spec (`packages/qwik/src/core/tests/zz-parallel-probe.spec.tsx`, deleted
afterwards, `git status` clean) rendered five roots through `renderToString` from
`@qwik.dev/core/server` with `containerTagName: 'div', instanceHash: 'probe'`, 3 runs each,
`performance.now()`. Delays lived in a module-level object (never captured, never serialized) so the
swapped renders produce byte-comparable HTML. It ran under `npx vitest run --root . --project resume`:
the root `ssr` vitest project only includes `packages/qwik/src/testing/testing.unit.tsx`
(`vitest.config.ts:36-40`), so the corpus specs go through the pipeline SSR generator via the
`resume` project (`renderSsrToDom` → `renderToString`, `packages/qwik/src/testing/resume-session.ts:146`).
The compiled SSR of the probe components was dumped with `transformModules` (temporary
`packages/compiler/pipeline/tests/zz-probe-dump.unit.ts`, also deleted) to cite the emitted shape.

## Part 1 — concurrency

| Case | Shape | Wall time (3 runs) | Verdict |
| --- | --- | --- | --- |
| (a) | two sibling `component$` each `useTask$(async () => await sleep(50))` | 107 / 102 / 102 ms | **sequential** |
| (b) | `<Parent><TaskA/></Parent>` (child task 50 ms) next to `<TaskB/>` (task 50 ms) | 102 / 102 / 102 ms | **sequential** |
| (c) | `component$(() => new Promise(r => setTimeout(() => r(<i>c</i>), 50)))` next to `<TaskB/>` | 52 / 50 / 51 ms | **parallel** |
| (c') | two siblings each `useComputed$(async …50 ms)` read in a text hole | 52 / 51 / 51 ms | **parallel** |
| (d) | `[1,2].map(i => <li key={i}><TaskA/></li>)` (task 50 ms per row) | 101 / 101 / 101 ms | **sequential** |

Why the split (all from the compiled output and the runtime):

- Sibling steps are started eagerly, in source order, before the first `maybeThen`
  (`packages/compiler/pipeline/generate/js-ssr.ts:1068-1085` `pushStep`: "Every step evaluates
  eagerly before the first await"; the join is a `reduceRight` of `maybeThen` at `:334-341`).
  Compiled `CaseA`: `const component0 = createComponent(TaskA, …); const component1 = …; const
  component2 = …; return maybeThen(component0, () => maybeThen(component1, …))`. So anything async
  that is **not** lane work overlaps: a promise-returning component (`renderSsrContent` →
  `renderSsrDynamicContent`, `packages/qwik/src/core/dom/content/content.ts:68-88`) and an async
  computed read (`renderSsrTextNode` → `retryOnPromise`, `packages/qwik/src/core/dom/effect/ssr-effect.ts:330-335`).
- `useTask$` work is lane work. `useTaskQrl` calls `scheduler.notify` synchronously
  (`packages/qwik/src/core/runtime/task.ts:157-172`); every non-Suspense component shares the one
  root lane (`packages/qwik/src/server/ssr-render.ts:174, 233`). `SsrLane.start/drain` runs **one
  task at a time**: an async task's promise becomes `this.pending`, later notifies are queued
  (`packages/qwik/src/server/ssr-scheduler.ts:119-123, 172-231`, `drain` returns
  `result.then(() => this.drain(next))`). Two 50 ms tasks therefore serialize to 100 ms.
- A component with a task has `waitForTasks` and is emitted through `deferRenderAfterTasks`
  (`packages/compiler/pipeline/generate/emit-setup.ts:233-253`): its whole render body — `nextId`,
  `addRoot`, child `createComponent` calls — runs inside `maybeThen(ctx.scheduler.flush(), () =>
  invoke(invokeCtx0, () => {…}))`. `flush()` resolves only when the lane is drained
  (`ssr-scheduler.ts:126-142`), so (b)'s nested child and (d)'s rows cannot overlap either.
- `.map` rows are chained by `renderNext` (`packages/qwik/src/core/dom/for/for.ts:896-961`): a
  promise row defers the next row, so even non-lane async rows would be sequential
  (`MULTI_HEAD_SSR.md` "A whole `For` is one head; async rows execute sequentially" is already the
  runtime's behavior).

Net: today the pipeline overlaps sibling async **render** work but serializes sibling async **task**
work through the single root lane, which is exactly the lane model in `MULTI_HEAD_SSR.md` "Request
scheduler and lanes" (one root lane; child lanes only for Suspense content,
`ssr-render.ts:192-230`).

## Part 2 — determinism

### What the writer does

`SsrOutputWriter` (`packages/qwik/src/core/ssr/output-writer.ts:14-82`) walks the output tree in
document order and stringifies. `materializeReference` (`:74-82`) is `String(reference.localId)` /
`localPath.join(' ')` — **no remapping**. The `SsrReferenceChunk` types (`node-id`, `root-ref`,
`root-ref-path`, `packages/qwik/src/core/ssr/output.ts:1-4`) carry numbers that were already final
when they were created. Every id in the table below is therefore fixed at **render time** in
execution order; the writer only decides *where* the bytes land (document order), never *what* they
are. The only write-time allocations are packet state bases (`$serializeNext$`) and the placement
of pending `sync$` definitions and backpatch scripts.

### Per-request mutable allocations during render

| # | Allocation | Site (file:line) | When it mutates | Can resolution-order permutation change bytes? |
| --- | --- | --- | --- | --- |
| 1 | Element / range ids (`q:id`, `<!b=`, `<!d=`, `<!t=`, row ids) | counter `nextId++` `server/ssr-render.ts:161, 236-238`; emitted as statements `compiler/pipeline/generate/js-ssr.ts:279, 612, 851, 886, 962`; rows `core/dom/for/for.ts:912`; Suspense fallback `core/dom/content/suspense-ssr.ts:96` | Render time, source order **inside one component body**. A `waitForTasks` body is wrapped by `deferRenderAfterTasks` (`emit-setup.ts:233-253`), so its `nextId` calls run after the lane flush; a Suspense fallback id is taken at defer time (delay>0: in the timer callback `suspense-ssr.ts:127-129`). | Yes, whenever two deferred bodies (task components under different lanes, Suspense fallbacks, children of promise-returning components) run in resolution order. Today masked by the single serial root lane: (a)/(b) swaps kept `q:id="0"/"1"`. |
| 2 | Serialization root indices | `$addRoot$` `core/shared/serdes/serialization-context.ts:230-253` (`index = $roots$.length`); callers: compiler statements `js-ssr.ts:1079-1083`; task registration `server/ssr-scheduler.ts:117` (from `core/runtime/task.ts:171`); event-attr captures `core/shared/serdes/qrl-to-string.ts:82-92`; refs `server/ssr-ref.ts:24`; context scope `ssr-render.ts:245-251`; deferred content root `ssr-render.ts:214` (inside `content.then`); placeholder root `suspense-ssr.ts:111`; packet subscriptions `ssr-render.ts:602, 608` | Render time, call order. Statement-level `addRoot` and task registration are eager (source order); **event attrs are in the value expression** (`js-ssr.ts:1189-1192` pushes `ctx.eventAttrParts(...)` into `parts`, not `statements`), so their capture roots are allocated after the component's awaits resolve. Deferred content roots are added in the `.then`. State script writes `$roots$` by index (`core/shared/serdes/serialize.ts:772-781`). | **Yes — proven** (see diff). Root numbers appear in `q-e:*` attrs, `<!c=` markers, `q:sub` pairs and the state script. |
| 3 | Style ids / dedupe | `styleIds` Map `ssr-render.ts:160, 234`; insert in `core/runtime/use-styles.ts:6-25, 55-61` at hook call; head injection iterates Map order `ssr-render.ts:772-787`; packet delta `:789-798` + `emittedStyles` `:310` | Render time, at component **setup** (synchronous, before any flush). Setup order = `createComponent` call order, except components created inside a deferred body. | Yes for `<style>` order in `<head>` / packets when styled components live in different deferred bodies; content is deduped by id so only order moves. |
| 4 | Event registration | `$eventNames$` / `$eventQrls$` Sets `core/shared/serdes/serialization-context.ts:125-126`, filled by `addEvent` `server/ssr-events.ts:65-71` during event-attr serialization; `emitQwikEvents` iterates insertion order `server/ssr-script-emitter.ts:147-157`; per-packet `takeNewValues` `ssr-render.ts:800-809`; `$eagerResume$` → `q-d:qidle` `ssr-render.ts:631-645` | Same moment as #2 (value expression, post-await). | Yes: `_qwikEv.push("e:click","e:input")` order and which packet first introduces an event name. Not visible in the probe because both siblings use the same event. |
| 5 | `useId` counter | `core/runtime/use-id.ts:9-13` `context.ids.next++`; root context `ids: { next: 0 }` `ssr-render.ts:129`; inherited by child contexts `core/runtime/invoke-context.ts:88` | Render time, at setup (sync). | Yes when setups run in resolution order (nested under deferred bodies); no for top-level siblings (setup is eager). Probe kept `id="s0"/"s1"` in every swap. |
| 6 | `sync$` tables | `$addSyncFn$` index in first-call order `serialization-context.ts:287-306`; `$requireSyncFn$` / `$pendingSyncFns$` `:283-285`; `emittedSyncFns` + `ctx.syncFn` `ssr-render.ts:136, 267-275`; `flush()` prepends pending defs before the chunk being written `:364-378` | Index: render time (call order, same moment as #2). Placement: write time. | Yes for the numeric id of `#<n>` sync handlers and the order of `q:func` definitions ahead of a chunk. |
| 7 | Deferred ranges | `deferred` push order `ssr-render.ts:203-228`; `ready` = resolution order `:216`; `blockedLanes` `:207`; packet loop picks first ready range whose parent is out `:447-472`; `$serializeNext$` base = `$rootStateRootCount$` `serialization-context.ts:146-168` | Range **id** is the caller's `nextId` (#1). Packet order and each packet's `q:base` are decided at write time from `ready` order. | Yes by design (OOOS): packet order, `q:base`, `q:sub` pairs and the `<template q:s>` sequence follow resolution order. Bytes-stable only under the reveal gates (`canEmit`). |
| 8 | Lanes | `createLane` `ssr-scheduler.ts:33-40`, lane id = creation order | Render time, sync. | No (creation is synchronous at Suspense open). |
| 9 | Patch queues | `SsrLane.collectPatch` `ssr-scheduler.ts:268-285` (completion order, last write wins per target/name); `takePatches` iterates lanes by id `ssr-render.ts:340-355`; `emitBackpatch` `ssr-script-emitter.ts:172-180`; written at `:356-359, 393-401, 453-456, 498-501` | Collected as effects settle (resolution order); written at flush points. | Yes for the entry order inside a backpatch script and which flush point carries it; idempotent semantically. |
| 10 | Effect target ids | `SsrDomEffectBase.targetId` `core/dom/effect/ssr-effect.ts:69` | Derived from #1. | Follows #1. |
| 11 | `q:instance` | `randomStr()` `ssr-render.ts:135, 896` unless `opts.instanceHash` | Once per request. | Random, not order-related (fixed to `probe` in the experiment). |

`SsrLane.notify` also does `$addRoot$(subscriber)` for every task (`ssr-scheduler.ts:117`) — a root
the writer never sees a reference to but which occupies an index, so parallel lanes registering tasks
would shift every later root number.

### Diff experiment

Each root rendered twice with the sleeps swapped (first sibling slower, then faster). Full HTML
including the state script compared with `===`.

| Case | Delays (first → second render) | Bytes identical? |
| --- | --- | --- |
| (a) two task siblings | a=60,b=10 → a=10,b=60 | **yes** (71 ms vs 70 ms — sequential either way) |
| (b) parent>task child + task sibling | a=60,b=10 → a=10,b=60 | **yes** (71 ms vs 71 ms) |
| (c') two async-computed siblings | c=60,d=10 → c=10,d=60 | **no** — first difference at byte 194 |

(c') first render (C slow, D fast) vs second (C fast, D slow), differences only:

```
<p q:id="0" id="s0" q-e:click="mock-chunk#_run#5">C</p><p q:id="1" id="s1" q-e:click="mock-chunk#_run#4">D</p>
<p q:id="0" id="s0" q-e:click="mock-chunk#_run#4">C</p><p q:id="1" id="s1" q-e:click="mock-chunk#_run#5">D</p>
…state script roots 4/5:  9,"7#4#-2",9,"7#5#-6"   vs   9,"7#4#-5",9,"7#5#-3"
…tail: …q_e_click_segment_14…, …q_e_click_segment_11…   vs   …segment_11…, …segment_14…
```

`q:id`, `useId` (`s0`/`s1`), text and `q:len` were unchanged; only the event-QRL roots (#2/#4)
moved, because `ctx.eventAttrParts(...)` sits in the post-await value expression of the compiled
`ComputedC` (`return maybeThen(attr0, … maybeThen(text0, … ctx.eventAttrParts("q-e:click", …)))`).
The two task cases stay identical only because the serial root lane forces both deferred bodies to
run after **all** tasks finish, in `.then` registration (= source) order — the same mechanism that
makes them take 100 ms.

### Verdict — what an ordered-commit layer must still isolate

Nothing in today's output is resolved at write time: the writer stringifies numbers that were
allocated during execution, so "document-order commit" cannot be bolted on at the writer alone. To
let heads run truly in parallel (per-head lanes so (a)/(b)/(d) drop to ~50 ms) and still emit stable
bytes, every allocation in the table has to become head-local and be remapped at commit: the
`nextId` counter (#1, including Suspense fallback ids taken from timers), all `$addRoot$` sites
(#2 — statements, task registration in `SsrLane.notify`, event captures, refs, context scopes,
deferred content/placeholder roots), the `styleIds` Map order (#3), `$eventNames$`/`$eventQrls$`
insertion order (#4), the `useId` counter (#5), sync-fn indices (#6) and per-lane patch queues (#9);
the writer then needs a real `materializeReference` that applies the head's `nodeIdBase`/`rootIdMap`
(the `SsrCommit` shape sketched in `MULTI_HEAD_SSR.md` "Isolated framework transactions"). The (c')
experiment is the preview: as soon as two heads finish in different orders, the post-await parts of
the value expression (event attrs, and by extension anything that allocates inside a deferred body)
permute root numbers, event-name order and state-script layout even though the visible HTML text is
unchanged. Deferred-range packet order (#7) is intentionally resolution-ordered and stays outside the
isolation scope; its `q:base` is already allocated at write time and only needs the head remap for
the roots it contains.
