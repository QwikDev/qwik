# Deferred multi-head SSR and lean Suspense OOOS

Status: generic multi-head deferred; lean Suspense implemented
Last updated: 2026-07-23

The active compiler contract lives in [`PLAN.md`](./PLAN.md). This document preserves the candidate
design for eager generic multi-head SSR and records the implemented, separate one-shot
Suspense/OOOS contract. Base SSR remains sequential; only explicit Suspense boundaries may split a
fallback shell position from a later resolved packet.

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
|- root lane        notify(A) -- A pending -- flush -- seal root
|- sibling lane 1   notify(B) -- B ready   -- flush -- seal head 1
`- sibling lane 2   notify(C) -- C pending -- flush -- seal head 2
                                      |
ordered writer: root shell -> head 1 -> head 2
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

## Lean compiler-driven Suspense

This section is independent of generic multi-head SSR. Suspense is a compiler-recognized, one-shot
special case of the existing branch/content range model. It must not introduce a Suspense scheduler,
subscriber kind, owner marker, lane transaction, ID remapping layer, state-patch registry, or runtime
tree.

### Public contract

```ts
interface SuspenseProps {
  readonly fallback$?: QRL<() => JSXOutput>;
  readonly delay?: number;
}
```

- The fallback may appear only while the boundary's initial content is pending.
- Synchronous initial content never resolves or invokes `fallback$`.
- The first successful content commit removes the fallback permanently.
- Later async updates use the existing `ContentBlock` stale-content behavior and never return to the
  fallback.
- A newly mounted boundary instance receives a fresh one-shot lifecycle.
- Fallback QRLs use the same generic target-native render-QRL plan as every other reachable ordinary
  QRL whose single final return contains JSX.
- Manually thrown Promises and thenables are unsupported. Errors follow the existing CSR scheduler or
  SSR request failure path.

`Reveal`, update-time fallback, `showStale`, async scalar backpatching, and streamed `sync$` functions
are outside the first implementation.

### Compiler lowering

The compiler recognizes direct, aliased, and namespace `Suspense` imports by binding identity and
respects shadowing. It propagates parser-sensitive in-order mode through components and projections,
erases the JSX marker, and creates:

- one target-native render segment for all boundary children;
- one ordinary QRL for `fallback$`, with `SegmentPlan.render !== null` when it contains JSX;
- one existing CSR range plan;
- one small SSR Suspense operation carrying range ID, content QRL, fallback QRL, and delay.

Do not add a Suspense-specific QRL role or a custom host element.

Extraction records only ordinary QRL structure, captures, parameters, and reachability. Semantic
lowering independently attaches `RenderFunctionPlan` to every reachable ordinary function QRL whose
single final return contains JSX. CSR/SSR planners then choose the hidden
`(ctx, ...authoredArgs)` ABI, and the segment emitter mechanically follows that plan. No phase may
identify fallback rendering by `fallback$`, a generated symbol name, or a Suspense consumer.

### CSR ABI

Compiler output uses the existing comment range and one thin wrapper:

```ts
createSuspense(ctx, new BranchRange(ctx.document, start, end), contentQrl, fallbackQrl, delay);
```

`createSuspense()` lives beside `ContentBlock`; it is not a standalone runtime subsystem. Its initial
algorithm is:

1. Create a normal `ContentBlock` from `range.start` and `range.end`.
2. Run its subscription directly exactly once.
3. If the result is synchronous, let `ContentBlock` commit and return without touching fallback.
4. If the result is a Promise, start the sampled delay timer.
5. If the timer wins, render fallback in a child owner and replace the same range.
6. Store the fallback owner as `ContentBlock.currentOwner`.
7. Let the existing `ContentBlock.commit()` replace fallback, retain the range, and dispose the
   fallback owner when content resolves.
8. Report rejection through the existing scheduler path and dispose pending work.

The wrapper adds no signal, branch condition, scheduler extension, or update generation. Future
source invalidations already notify the normal content subscription.

### SSR ABI

Compiler output uses one readable wrapper rather than exposing request internals:

```ts
createSsrSuspense(ctx, rangeId, contentQrl, fallbackQrl, delay);
```

`createSsrSuspense()` returns `ValueOrPromise<SsrOutput>` and delegates to a private
`ctx.deferSuspense()` request callback. The request path owns the logical start/end range markers;
generated code never calls `ctx.deferSuspense()` directly.

The request callback uses the same global node ID counter, `SerializationContext`, style/event maps,
and existing root scheduler lane. Its small request-local record contains the segment ID, optional
parent ID, content Promise, and the content/fallback subscription roots needed for activation and
disposal. It creates no lane-local framework transaction or ID remapping.

For `delay > 0`, SSR waits for `Promise.race(content, timer)` before finalizing the shell position. If
content wins, final content is emitted inline and fallback is never invoked. If the timer wins, the
fallback range is emitted and the final content becomes a later packet. For `delay = 0`, fallback is
eligible immediately.

### Range protocol

CSR and SSR use the same logical start/end range. SSR output is comment-based and adds no custom
element or protocol CSS:

```html
<!d=0>
fallback
<!/d>
```

A resolved packet contains append-only state before its template:

```html
<script type="qwik/state" q:s="0" q:base="4" q:len="2">
  ...
</script>
<script type="qwik/state" q:s="0" q:base="6" q:len="0" q:sub>
  [0,4,0,5]
</script>
<template q:s="0">resolved content</template>
<script nonce="...">
  /* minimal range swap */
</script>
```

The shell emits one small executor only when an asynchronous boundary survives past shell commit.
Each packet emits only a nonce-protected call. The executor serializes packet application, scopes
scripts and comments to the nearest Qwik container, finds the existing comments, creates a native
DOM `Range`, deletes fallback contents, and inserts `template.content`. A packet whose range was
removed client-side tombstones its content root and exits without poisoning later packets. The
comments remain as the stable range for existing structural primitives.

Nested packets carry a parent segment ID and cannot be written before the parent packet. Sibling
packets without ordering constraints are written in Promise-resolution order.

### Append-only serialized state

Fallback roots, events, and loader readiness are part of the initial shell snapshot. Resolved content
uses the same global `SerializationContext` and IDs. Add one general incremental operation:

```ts
interface SerializedStateRange {
  readonly base: number;
  readonly len: number;
  readonly state: string;
  readonly forwardRefs?: readonly (number | string | number[])[];
}

$serializeNext$(): ValueOrPromise<SerializedStateRange | null>;
```

`$serializeNext$()` temporarily writes into a fresh buffer and serializes only roots added since the
previous snapshot. It does not create local IDs or remap tables. The request separately emits a
zero-root `q:sub` metadata chunk containing flat `sourceId, subscriberId` pairs only when resolved
content adds subscribers to sources serialized by an earlier snapshot.

Forward-reference metadata must not consume a root ID. Each state chunk covers only real roots, and
the newest forward-reference metadata replaces the previous cached table when registered. This keeps
later `q:base` ranges append-only in the shared global ID space.

The existing container state scan is factored into one idempotent `registerStateScript(context,
script)` function used by initial resume and streamed packets. It maps append-only root ranges,
updates forward-reference metadata, records `q:sub` edges lazily, and treats the same script element
as a no-op. The protocol trusts state emitted by the matching server serializer rather than
validating it again in the packet executor.

Before applying a packet in an already resumed container, the executor registers its state scripts,
disposes the fallback content root and its complete owner tree, inserts the new DOM, and then prepares
only that boundary's content root. Preparation attaches dependencies to live sources and immediately
catches stale packet DOM up to current client values. If the container has not resumed, `q:sub`
attaches lazy subscriber roots when each source first resumes. Global append-only ranges may contain
roots discovered by concurrent siblings, so packet delivery never treats the whole range as boundary
ownership. Removed fallback roots remain tombstoned in durable state.

Compiler-extracted lazy QRL handlers are supported in streamed content. Explicit `sync$` functions
created only inside delayed content remain unsupported until their function table can be appended
without a second protocol.

### Stream writing

The root renderer writes:

1. Container opening markup, shell, fallback state, loader, events, and container-ready signal.
2. Resolved packets one at a time through the existing writer, respecting sink backpressure.
3. Container closing markup only after all packets finish.

The request fails fast on content, serialization, or sink rejection. No packet or closing markup may
start after failure is observed. An already active external write may finish.

`renderToString()` and `renderToStream({ outOfOrder: false })` await final content, emit it inline, and
contain no range packet executor.

### Deliberate exclusions

The implemented boundary does not add:

- a Suspense runtime module or coordinator class;
- owner boundary markers or scheduler scopes;
- a subscriber kind;
- local serialization contexts or ID remapping;
- `q:chunk` registries;
- source reserialization or mutable subscriber-list snapshots;
- `qPatch` or async scalar backpatching;
- Reveal groups;
- update generations;
- custom `<q-s>` hosts or protocol CSS;
- streamed explicit `sync$` function tables;
- imported JSX fallback QRLs until standalone module QRL rendering is target-native;
- concurrency or buffered-byte limits.

Async attributes and properties keep their existing in-order behavior and do not trigger fallback.
The first async CSR `useTask$` is not a Suspense trigger in this lean version because supporting it
would require the boundary-aware scheduler that this design intentionally avoids.

## Verification gate

Run the closest focused unit after each implementation edit, then:

```bash
pnpm vitest run packages/compiler/src/<focused>.unit.ts
pnpm vitest run packages/qwik/src/core/<focused>.unit.ts
pnpm vitest run packages/qwik/src/server/<focused>.unit.ts
pnpm build.core.dev
pnpm playwright test <focused-suspense-file> --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

Before handoff, run affected compiler/core/server suites, `pnpm tsc.check`, `pnpm api.update`,
`pnpm build.core`, the SSG snapshot test, and bundle-size checks. Add one minor changeset only when
the complete focused browser path passes.

The initial 200-250 line estimate is a design-review trigger, not permission to omit ownership,
late-resume, parser, failure, or trust-boundary handling. Enforce the runtime cost directly instead:
no Suspense imports or scripts without the feature, no Promise or timer on synchronous content, one
executor per streamed response, one small call per packet, and no per-boundary serializer or lane.
