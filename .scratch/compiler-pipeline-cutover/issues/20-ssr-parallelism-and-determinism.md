# Does staged SSR already run sibling async work concurrently, and is the output deterministic?
Type: research
Status: resolved
Blocked by:

## Question

For multi-head (ticket 09, Varixo's definition: promises across components resolve in parallel,
output committed in document order). Two facts: (1) Concurrency today: with the pipeline SSR
generator, do sibling async components (each awaiting ~50 ms in setup via `useTask$` or returning
a promise) render in ~50 ms total or ~100 ms? Same for a parent with an async child and an async
sibling, and for async rows. (2) Determinism: which per-request state does a component render
mutate synchronously in execution order (element/`q:id` counters, serialization roots, style
dedupe, event registration, `useId`, sync$ tables, deferred-range ids), and does permuting
promise resolution order change the emitted HTML, state script, or ids? Report the exact
allocation sites and whether the flat output's typed reference chunks are resolved at write time
(document order) or at render time.

## Answer

1. Concurrency (probe, 3 runs, ms): two `useTask$` siblings 102, parent>task child + task sibling 102, `.map` rows with task 101 — sequential; promise-returning component next to a task sibling 51, two async `useComputed$` text siblings 51 — parallel.
2. Cause: steps start eagerly in source order (`js-ssr.ts:1068` pushStep) so non-lane async overlaps, but every task lands on the one root lane whose `SsrLane.drain` runs one task at a time (`ssr-scheduler.ts:172-231`), and a task component's whole body is wrapped in `maybeThen(ctx.scheduler.flush(), …)` (`emit-setup.ts:233-253`).
3. All ids are assigned at render time in execution order: `nextId` (`ssr-render.ts:236`, Suspense fallback from a timer `suspense-ssr.ts:96`), `$addRoot$` (`serialization-context.ts:230`; tasks `ssr-scheduler.ts:117`, event captures `qrl-to-string.ts:87`, refs, context scope, deferred roots `ssr-render.ts:214`), `useId` (`use-id.ts:12`), `styleIds` Map order, `$eventNames$` Set order, sync-fn indices, lane patch queues.
4. The writer never remaps: `materializeReference` is `String(localId)` (`output-writer.ts:74-82`); typed `SsrReferenceChunk`s are a formality, only packet `q:base`, pending `sync$` defs and backpatch placement happen at write time.
5. Swap proof: task cases (a)/(b) byte-identical only because the serial lane runs deferred bodies in source order; the async-computed case differs (event-QRL roots `_run#4`/`#5` swap on the `<p>`s, state-script roots 4/5 and symbol order permute) because `ctx.eventAttrParts` sits in the post-await value expression (`js-ssr.ts:1190`).
6. Ordered commit therefore needs head-local counters/roots/styles/events/useId/sync tables/patches plus a real remap in the writer (`SsrCommit` in MULTI_HEAD_SSR.md); details in `research/20-ssr-parallelism-and-determinism.md`.
