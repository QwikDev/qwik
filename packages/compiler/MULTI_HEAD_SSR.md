# Deferred multi-head SSR design

Status: deferred; not in the current implementation scope
Last updated: 2026-07-17

The active compiler plan implements sequential SSR and lives in [`PLAN.md`](./PLAN.md). This document
preserves the candidate design for eager multi-head SSR. Nothing here is an implementation
requirement until the feature is explicitly brought back into scope.

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

## Deferred OOOS backpatch protocol

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

## Relationship to Suspense

Multi-head ordered commit does not implement Suspense. It adds no fallback, placeholder, reveal
queue, out-of-order patch, browser patch executor, or legacy `q:r`, `q:rp`, or `qO` protocol. Direct
`<Suspense>` remains unsupported by the active compiler plan.

The reserved public props remain:

```ts
type SuspenseProps = {
  fallback?: JSXOutput;
  delay?: number;
  showStale?: boolean;
};
```

Isolated segments, typed references, and remapping could later support Suspense, but Suspense needs
a separate scheduling contract:

- `renderToString()` resolves final content without a fallback.
- `renderToStream()` may emit a lazy shell/fallback and later reveal, and completes only after all
  reveals or a fatal error.
- Returned Promises and async-signal reads suspend the nearest boundary; without one, the root
  blocks. Manually thrown Promises and thenables remain unsupported.
- Errors and rejections are not caught by Suspense, and suspension in a fallback bubbles upward.
- Direct content reveals atomically; partial reveal requires nesting, and a descendant cannot reveal
  before its ancestor shell.
- Fallback and content use separate framework owners and transactions.
- Reveal patches carry HTML, node/root remapping, state delta, boundary ID, and generation; stale
  patches are ignored after unmount, replacement, or a newer generation.
- Final DOM, framework state, IDs, ownership, and resume behavior are deterministic even when
  streamed payload timing differs.

These Suspense details are also deferred and must not expand the current sequential SSR scope.
