# Deferred multi-head SSR and Suspense OOOS design

Status: multi-head deferred; Suspense/OOOS approved as a follow-up
Last updated: 2026-07-20

The active compiler plan implements sequential SSR and lives in [`PLAN.md`](./PLAN.md). This document
preserves the candidate design for eager multi-head SSR and the settled contract for the separate
Suspense/OOOS follow-up. Generic multi-head SSR remains deferred. The Suspense section below is the
implementation agreement once that follow-up starts; it does not expand the current sequential
compiler completion scope.

## Goal and boundary

Multi-head SSR would start discoverable render work eagerly but commit framework output strictly in
document order. It is a computation scheduler, not Suspense: later content never reveals ahead of
an earlier document position.

The first version would have no concurrency or buffered-byte limit. Those controls should be added
only if measurement shows they are needed.

## Request scheduler and lanes

The sequential renderer already owns one request-local `SsrScheduler` and uses a single root lane.
This is a real task scheduler, not an empty multi-head abstraction: `useTaskQrl()` starts the first
task eagerly, later registrations queue lazily, and `flush()` stabilizes the lane before its
RenderPlan runs. A final root flush happens before style/state serialization. A lane owns only its
task queue, pending task, failure, parent ID, and local serialization context; it performs no I/O,
global ID allocation, or metadata commit.

Multi-head can extend that exact request scheduler with one lane per head:

```text
request scheduler
├─ root lane        notify(A) ── A pending ── flush ── seal root
├─ sibling lane 1   notify(B) ── B ready   ── flush ── seal head 1
└─ sibling lane 2   notify(C) ── C pending ── flush ── seal head 2
                                      │
ordered writer: root shell → head 1 → head 2
```

Different lanes may start tasks eagerly and settle independently. `flush()` and failure remain
lane-local, and a head may be sealed only after its own lane flush. Document order is enforced by
the transaction/writer layer, not by blocking unrelated lanes in the scheduler. The current root
lane therefore supplies useful behavior now without putting head transactions or an OOOS queue in
the runtime prematurely.

## Runtime detection with `maybeFork()`

The compiler should not try to prove which render boundaries are async. It can wrap each candidate
boundary, and runtime can inspect the actual result:

```ts
function maybeFork(render: (ctx: SsrContext) => ValueOrPromise<SsrOutput>) {
  const segment = createIsolatedSegment();

  try {
    const output = render(segment.ctx);
    return isThenable(output) ? settleAsync(segment, output) : segment.seal(output);
  } catch (error) {
    segment.rollback();
    throw error;
  }
}
```

This is a design sketch, not a fixed API. A synchronous result must remain synchronous and allocate
no Promise or microtask. A returned Promise makes the segment async and is awaited. Manually thrown
Promises and thenables are unsupported; thrown errors roll back the segment and propagate. Async
signals retain their dedicated effect-level retry path. Component setup and hook registration run
once.

The isolated segment must exist before `render()` runs. Calling `render(parentCtx)` first and
forking only after it returns a Promise is too late: the render may already have allocated IDs,
registered roots or effects, or appended output to its parent.

## Isolated framework transactions

Each head owns a local framework transaction containing its output, owner, node/root references,
captures, styles, events, and effects. Promise callbacks may only settle that local head. They must
not allocate global IDs, merge metadata, write to the sink, emit scripts, or commit themselves.
Head IDs and parent IDs are assigned synchronously at creation, independently of Promise-resolution
order.

The sequential structured output ABI from `PLAN.md` remains the base. Multi-head extends the tree
with nested heads while keeping references typed:

```ts
type MultiHeadSsrOutput = SsrChunk | SsrHead | readonly MultiHeadSsrOutput[];

type SsrReferenceChunk =
  | { readonly type: 'node-id'; readonly localId: number }
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-ref-path'; readonly localPath: readonly number[] };
```

Head-local IDs and roots are remapped during ordered commit. The writer materializes complete
records from typed references; it never parses generated HTML. The exact `SsrHead` and transaction
shapes remain implementation details to settle when this work resumes.

A candidate commit result, kept separate from I/O, was:

```ts
interface SsrCommit {
  readonly nodeIdBase: number;
  readonly rootIdMap: readonly number[];
  readonly newRootStart: number;
  readonly newRootLocalIds: readonly number[];
  readonly addedStyles: readonly string[];
  readonly addedEvents: readonly string[];
}
```

Framework rollback disposes uncommitted owners and discards their local output and metadata. A
committed transaction stays committed.

## Ordered commit and tree behavior

- All discoverable sibling heads start eagerly in source order.
- A fast later sibling may finish computation early but waits for every earlier document position
  before commit.
- Nested heads remain visible in structured output. An ancestor commits before its descendant, and
  the descendant commits before the next sibling.
- A child hidden behind an earlier `await` cannot start until that continuation reaches it.
- A whole `For` is one head; async rows execute sequentially in source order.
- A whole slot is one head; projections execute sequentially in projection order.
- Styles, events, effects, IDs, roots, and captures merge only during ordered commit.

When heads do not coordinate through mutable user state, Promise-resolution permutations should
produce the same framework output, ID remapping, captures, and ownership.

## User state is not transactional

Signals, stores, and other user objects remain ordinary shared JavaScript state. Multi-head SSR does
not add owner registration, write guards, locking, cloning, merge rules, or conflict resolution.
Mutations happen in native JavaScript execution and Promise-continuation order; ordered commit only
orders framework output.

Consequently, framework rollback does not undo user mutations. A head that mutates shared state and
then rejects can leave that mutation behind, and timing-dependent shared state can make rendered
content timing-dependent as well. This is an accepted consequence of the minimal model, not a
guarantee of deterministic shared-write behavior.

## Other decisions to reopen with implementation

- Sync QRL references need a typed, remappable representation before they can be created inside a
  local transaction. Do not allocate global sync-function IDs early merely to avoid that type.
- True document streaming cannot discover and revise the `<head>`/`<body>` shell after bytes have
  already been flushed. Choose an explicit document/shell mode or retain buffering until the shell
  is known; do not infer it by rewriting already committed HTML.
- Decide whether a synchronously completed `maybeFork()` segment is represented as a ready segment
  or merged into its parent. The choice must preserve document-order metadata without creating a
  Promise or microtask.

## Shared OOOS transaction constraints

An attribute patch can identify its element by a stable compiler-owned ID and does not need an
attribute placeholder. Structural output needs a compiler-emitted start/end boundary. Each head
renders into its lane-local serialization context and transaction; ordered commit remaps IDs and
roots, deduplicates shared roots by identity, and merges styles, events, state, and subscription
deltas.

Cross-boundary dependencies require explicit state/subscription patches. A patch waits until its
ancestor shell and every referenced root are committed. All HTML, state, loader, event, and patch
payloads still pass through the single serialized writer/sink, including nonce handling and parser
contexts in which inline scripts are unsafe. `renderToString()` continues to await final content
and inline it without backpatch payloads.

## Failure and backpressure

- Attach rejection handlers as soon as a head starts, including heads waiting behind earlier output.
- A rejection is fail-fast: after it is observed, do not start new writes or emit scripts, patches,
  or closing markup. An already active external write may finish before the render rejects.
- Synthesize no error markup. Dispose every uncommitted framework transaction and owner; do not
  attempt to cancel or roll back user work.
- Head computation may continue while the sink applies backpressure, but the root writer keeps at
  most one external `write()` in flight.

Acceptance coverage should include eager siblings, every relevant resolution permutation, nested
ancestor/descendant ordering, a child behind an `await`, sequential rows and projections, immediate
rejection observation, no writes after failure, disposal of uncommitted framework state, sink
backpressure, and the synchronous fast path.

## Suspense and OOOS follow-up

Multi-head ordered commit does not implement Suspense. Suspense creates lanes only at explicit
boundaries and may reveal a later boundary before an earlier sibling. Do not expose generic
multi-head scheduling or restore the legacy `q:r`, `q:rp`, or `qO` protocol.

### Public and compiler contract

```ts
interface SuspenseProps {
  readonly fallback$?: QRL<() => JSXOutput>;
  readonly delay?: number;
}
```

- `fallback$` is optional. Local, inline, and imported QRLs behave identically.
- A boundary may show its fallback only during its first pending render. Its lifecycle is
  `initial -> pending -> resolved`, and `resolved` is terminal for that boundary instance.
- Synchronous initial content never invokes `fallback$`. Pending initial content renders the
  fallback into its own owner and transaction; `delay` controls when it becomes visible.
- `delay` is sampled when the boundary is created and its timer runs on the server for streamed SSR.
- Reveal replaces the fallback DOM and disposes its owner. Later suspended updates keep the last
  resolved content visible and never recreate or reveal the fallback.
- A newly mounted boundary instance has its own one-shot initial lifecycle. No global fallback
  registry or update generation tracking is needed.
- JSX in any extracted QRL is target-native transformed. A segment with `render !== null` is enough;
  do not add a render-specific QRL role.
- Async structural content suspends the nearest boundary. Async attributes and properties use
  backpatches and do not suspend the boundary.
- Manually thrown Promises and thenables are unsupported. Errors and rejections fail the render;
  ErrorBoundary remains separate work.
- Parser-sensitive table, select, SVG, and MathML placements automatically use in-order rendering.
  The compiler also emits a development diagnostic explaining why OOOS was disabled there.

`renderToStream()` enables OOOS by default and has an explicit opt-out. `renderToString()` and SSG
await final content and emit neither fallback packets nor browser executors.

### Boundary lanes

The renderer creates a content `SsrLane` before invoking a boundary's initial content. A lane owns
its task queue, owner, local `SerializationContext`, structured output, styles, events, captures,
and local node/root IDs. Promise continuations can settle only their lane.

- A lane is ready only after content rendering, every first SSR `useTask$`, and state sealing finish.
- `deferUpdates` affects later executions after resume; it never makes the first SSR task nonblocking.
- A synchronous boundary stays on the Promise-free path and emits final content in place.
- Once a boundary returns async work, it always emits an OOOS packet, even if that work settles
  before the root prelude is written.
- Sibling lanes settle independently. Global root IDs are allocated at commit, while node IDs are
  local and remapped at commit.
- A nested packet may settle early, but the server does not write it until its parent `qSeg` packet
  has been written.
- Fallback and content owners remain separate. Reveal disposes the fallback owner; failure disposes
  every uncommitted owner.
- After initial reveal, later async updates use the ordinary scheduler and leave resolved content in
  place. They do not create SSR lanes, fallback work, reveal packets, or generations.

The root shell, initial state, loader, protocol CSS, packets, and closing markup all pass through the
existing `SsrOutputWriter`. It keeps one external write in flight and is the only layer allowed to
touch the sink.

### Stream protocol

Each boundary uses one `display: contents` host. While pending it contains fallback DOM; reveal
atomically replaces its children with final content and keeps the host as the stable range. Protocol
CSS is emitted once with the render nonce. Reveal metadata is packed into
`q:v="group,index,flags,total"` instead of adding one attribute per field.

A segment packet is emitted in this order:

1. New `qwik/state` chunks with `q:chunk`, `q:base`, and `q:len`.
2. An optional `qwik/state-patch` script.
3. A `<template q:s="segmentId">` containing remapped content.
4. An install-once `qSeg` executor followed by `qSeg(segmentId)`.

The `qSeg` executor is absent from the root prelude and from responses without asynchronous
boundaries. It is emitted with the first segment or the first delayed `qSeg.d(segmentId)` call.
Processing one segment performs structural insertion, state registration, subscription catch-up,
style deduplication, initial Reveal coordination, and fallback cleanup.

Initial state scanning and `qSeg` use the same `registerStateChunk()` path. Registering the same
element twice is a no-op. A different element reusing an existing `q:chunk` fails closed. Existing
roots are never replaced by streamed snapshots: state already resumed or changed on the client
wins.

Subscription deltas use a separate inert `qwik/state-patch` payload:

```text
[0, sourceRootId, ...subscriberRootIds]
[1, storeRootId, path, property, ...subscriberRootIds]
```

The first form patches a signal-like source and the second patches one store property. A live source
runs targeted catch-up before reveal; an unmaterialized source retains the pending edge for lazy
registration. The executor never scans the whole container.

Attribute and property patches use a separate install-once `qPatch` executor and stable numeric
`q:id` targets:

```text
[0, nodeId, attributeName, valueOrNull]
[1, nodeId, value]
[2, nodeId, checked]
```

Opcode `0` sets or removes an attribute, `1` patches `value`, and `2` patches `checked`. `qPatch` is
absent unless a patch is needed. Value and checked patches compare against `defaultValue` and
`defaultChecked` so streamed output never overwrites a user's edit.

Reveal coordinates only initial boundary resolution. It supports `parallel`, `sequential`,
`reverse`, and `together`, including collapsed fallback behavior. A boundary reveals atomically;
partial reveal requires nesting.

### Failure, security, and backpressure

- Attach rejection handlers when work starts. A rejection stops new writes and disposes every
  uncommitted lane; an already active sink write may finish.
- Synthesize no error HTML and do not attempt to roll back user state.
- Escape every serialized script payload against `</script` termination and preserve the configured
  nonce on executable scripts and protocol CSS.
- Scope numeric node lookup, state chunks, segments, and readiness to one container instance.
- Malformed opcodes, duplicate chunk IDs, missing targets, and cross-container references fail
  closed without broad DOM traversal.
- Do not add a concurrency limit or buffered-byte limit until measurements require one.

## Test-first implementation sequence

Each phase starts with the smallest failing test listed below. Do not proceed to the next phase until
the focused tests for the current phase pass. Existing test files and the deterministic OOOS release
endpoint are extended rather than replaced by a parallel fixture.

### Phase 1: API and target plans

- `packages/compiler/src/extract.unit.ts`: inline, local, and imported `fallback$` QRLs containing
  JSX receive target-native render segments without a new QRL role.
- `packages/compiler/src/semantic-lower.unit.ts`: Suspense and Reveal metadata is semantic, while
  parser-sensitive placements select in-order output and report a development diagnostic.
- `packages/compiler/src/plan-csr.unit.ts`: one replaceable boundary host and packed Reveal metadata
  are planned without runtime tree inspection or update generations.
- `packages/compiler/src/emit-ssr.unit.ts`: synchronous boundaries remain synchronous; generated SSR
  calls the boundary ABI with typed output and imports no packet executor when none is needed.
- Add the public declarations and remove only the Suspense/OOOS placeholder from
  `packages/qwik/src/core/tests/deferred-features.spec.ts`; leave unrelated deferred features skipped.

Exit criterion: compiler fixtures cover local, inline, and imported fallback QRLs, and an application
without Suspense has byte-for-byte equivalent generated control flow apart from intentional imports.

### Phase 2: CSR Suspense and Reveal

- Add one focused runtime unit beside the Suspense implementation for synchronous content without
  fallback invocation, exactly one fallback invocation for initial pending content, delay
  cancellation, nearest-boundary selection, terminal resolution, fallback owner disposal, stale
  content during later updates, and all initial Reveal orders.
- Convert `e2e/qwik-e2e/apps/e2e/src/components/suspense/suspense.tsx` to `fallback$` and keep
  `e2e/qwik-e2e/tests/suspense.e2e.ts` as the initial CSR and pure-CSR contract. Replace the existing
  repeated-update fallback cases with one assertion that later pending updates keep resolved content
  visible and never recreate the fallback.
- Replace timing sleeps with resolver or DOM-state assertions wherever the behavior is not itself a
  timer contract.

Exit criterion: fallback is interactive only while initial content is pending, is removed after
reveal, and never returns during later updates.

### Phase 3: SSR lanes and ordered output

- `packages/qwik/src/server/ssr-scheduler.unit.ts`: independent lanes, first-task blocking,
  synchronous fast path, immediate rejection observation, and owner disposal.
- `packages/qwik/src/server/ssr-render.unit.ts`: shell writes before a controlled boundary resolves,
  an async boundary always emits one packet, nested packets wait for their parent, opt-out stays
  in-order, and string rendering emits final content only.
- `packages/qwik/src/core/ssr/output-writer.unit.ts`: packet writes remain serialized, backpressure
  permits one sink write, and no write starts after failure.

Exit criterion: root readiness can occur while the response remains open, and responses without an
async boundary contain no `qSeg`, `qPatch`, template packet, or protocol CSS.

### Phase 4: streamed state and `qSeg`

- `packages/qwik/src/server/ssr-script-emitter.unit.ts`: packet order, `q:chunk` metadata, nonce,
  script escaping, style deduplication, and install-once executor emission.
- `packages/qwik/src/core/runtime/container-context.unit.ts`: initial and streamed chunk registration,
  same-element idempotence, duplicate-ID rejection, cross-chunk refs, and lazy pending edges.
- Extend the closest serdes inflate unit with a streamed writer/reader round trip; do not create a
  second serialization format.
- Add a focused `qSeg` behavior unit for atomic replacement, fallback owner disposal, client-wins
  state, targeted catch-up, nested gating, delay cancellation, and container scoping.

Exit criterion: a segment depending on root state can arrive after resume, reveal current client
state, and subscribe to later changes without rescanning the container.

### Phase 5: `qPatch`

- `packages/compiler/src/emit-ssr.unit.ts`: pending attributes/properties receive stable numeric IDs
  and typed records without suspending a boundary.
- `packages/qwik/src/server/ssr-script-emitter.unit.ts`: attribute/value/checked records are escaped
  and the executor is emitted only on first use.
- Add a focused `qPatch` behavior unit for set, remove, value, checked, malformed records, missing
  targets, container scoping, and dirty form controls.
- Expand `e2e/qwik-e2e/tests/backpatching.e2e.ts` with attribute removal and user-edited value and
  checked cases.

Exit criterion: async attributes do not show a fallback and patches never overwrite user input.

### Phase 6: streamed integration

Port the existing fixture in
`e2e/qwik-e2e/apps/e2e/src/components/suspense/ooos.tsx` to `fallback$`. Extend
`e2e/qwik-e2e/tests/suspense-ooos.e2e.ts` only for missing behavior:

- shell and fallback resume while a controlled segment is pending;
- fallback controls resume while pending, then fallback DOM is removed permanently after reveal;
- sibling boundaries resolve in both orders and nested children cannot reveal before parents;
- root state changed by the shell or fallback wins and the revealed subscriber catches up;
- delay wins before content and content wins before delay;
- every Reveal order and collapsed behavior;
- styles are installed before reveal and executors are emitted exactly once;
- first async SSR tasks suspend, while async attributes do not;
- OOOS opt-out, `renderToString()`, and SSG contain final content without packets;
- failures stop the stream without browser errors or leaked closing packets.

Use controlled release IDs and observable DOM markers. Clock waits are allowed only for the delay
contract; all other cases must avoid arbitrary sleeps.

### Verification gate

Run the focused unit after each implementation edit, then the three browser files after a fresh dev
build:

```bash
pnpm vitest run packages/compiler/src/<focused>.unit.ts
pnpm vitest run packages/qwik/src/server/<focused>.unit.ts
pnpm vitest run packages/qwik/src/core/<focused>.unit.ts
pnpm build.core.dev
pnpm playwright test e2e/qwik-e2e/tests/suspense.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
pnpm playwright test e2e/qwik-e2e/tests/suspense-ooos.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
pnpm playwright test e2e/qwik-e2e/tests/backpatching.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

Before handoff, run the affected compiler/core/server suites, `pnpm tsc.check`, `pnpm api.update`,
`pnpm build.core`, the SSG snapshot test, and bundle-size checks. Add one minor changeset for the
published Suspense/OOOS feature. Inspect every snapshot and size-budget change; never bulk-update
snapshots.
