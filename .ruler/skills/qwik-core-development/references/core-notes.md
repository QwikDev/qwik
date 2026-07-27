# Qwik Core Notes

Use this reference only after loading `qwik-core-development` and only for core runtime work that
needs more detail than the skill body. Keep it current when source changes make a note stale.

## Maintainer Bias From History

Recent core work by Varixo and Wout tends to:

- isolate the broken invariant before changing code;
- keep producer and consumer protocol changes together;
- add focused regression tests beside the changed behavior;
- preserve compatibility paths deliberately and test them;
- extract small semantic helpers when they make ownership or ordering clearer;
- leave comments only for non-obvious runtime encodings, lifecycle ordering, or compatibility
  constraints.

Use that style for core work. Avoid broad rewrites, unexplained fallbacks, and temporary debug code.

## Source Map

```text
packages/qwik/src/core/
  client/                     client render, VNode materialization, cursor/diff integration
  reactive-primitives/         signals, async signals, stores, subscriptions
  shared/qrl/                  QRL classes and helpers
  shared/serdes/               serialization, inflation, root refs
  shared/vnode/                VNode structures
  shared/cursor/               cursor walking and DOM update primitives
  ssr/                         server-side JSX rendering
  tests/                       core feature specs
```

Closest tests are usually in the same subtree and named `*.unit.ts(x)` or `*.spec.ts(x)`.

## AsyncSignal Current Model

Current API and implementation facts:

- The async engine (AsyncJob, loading/error, polling, cleanup) lives in `ComputedSignalImpl`;
  `AsyncSignalImpl` only parses options and sets `AsyncSignalFlags.ASYNC_MODE | CTX_ARG`.
- All compute fns receive the ComputeCtx argument (`track`, `previous`, `info`, `cleanup`,
  `abortSignal`); sync computeds allocate an AsyncJob per compute and run the previous job's
  cleanups before recomputing. `CTX_ARG` signals (useAsync$/useResource$) track only via the
  explicit `ctx.track()`; computeds auto-track synchronous reads via a dedicated invoke context,
  but that context is lost after the first `await` — later reads must use `ctx.track()`.
- A computed whose fn returns a promise lazily switches on `ASYNC_MODE` (loading state stays
  `declare`d until then) and then has the full AsyncSignal API. The `clientOnly` option sets
  `ASYNC_MODE` at construction, since SSR can never resolve such a signal synchronously. Sync compute throws stay in sync
  mode but still land in `.error`; reading `.value` rethrows until a recompute or explicit value
  set clears it. Thrown promises must keep propagating for retry, never be captured as errors.
- Serialization keys off `ASYNC_MODE`, not `instanceof`: async-mode computeds round-trip as
  `TypeIds.AsyncSignal` and resume as `AsyncSignalImpl` instances whose serialized flags (no
  `CTX_ARG`) preserve auto-track semantics. Runtime checks must use flags, not class identity.
- `createAsyncSignal()` passes the full `AsyncSignalOptions` object to the constructor.
- `expires` is the current expiration duration in milliseconds.
- `poll` controls whether expiration automatically recomputes or only marks stale.
- `interval` remains a deprecated compatibility API: positive means `{ expires, poll: true }`,
  negative means `{ expires: abs(interval), poll: false }`.
- `allowStale: false` clears value only for manual invalidation and non-polling expiration. Polling
  keeps the old value while recomputing to avoid visible loading flashes.
- `clientOnly` skips server computation and computes on first client read.
- `eagerCleanup` schedules cleanup after subscribers drop to zero.

When changing AsyncSignal behavior, inspect:

- `packages/qwik/src/core/reactive-primitives/impl/async-signal-impl.ts`
- `packages/qwik/src/core/reactive-primitives/types.ts`
- `packages/qwik/src/core/reactive-primitives/signal.public.ts`
- `packages/qwik/src/core/reactive-primitives/cleanup.ts`
- `packages/qwik/src/core/shared/serdes/serialize.ts`
- `packages/qwik/src/core/shared/serdes/inflate.ts`
- closest async signal unit/spec tests

## AsyncSignal Invariants

- A first unresolved read may throw the compute promise; tests should use `retryOnPromise()` when
  exercising first-read behavior.
- `.value`, `.loading`, and `.error` have separate subscriber sets. Subscriber-sensitive logic must
  account for all three.
- `expires` setter clears existing timeout, stores the new value, and reschedules only when
  subscribers exist.
- `poll` setter updates the `NO_POLL` flag and reschedules when needed.
- `invalidate(info)` records the latest info and increments the info version.
- AbortError is cancellation, not a user-visible `.error`.
- Reading `.pending` or `.error` triggers computation when needed; serialization must read the
  private `$untrackedPending$`/`$untrackedError$` fields to avoid starting computes.
- `clientOnly` resume rides on the state script's `q-d:qidle` `_res` QRL built from
  `$eagerResume$`; SSR must emit the state script whenever `$eagerResume$` is non-empty, even if
  no roots were discovered yet (the QRL captures become roots during attribute serialization).
- Timeout IDs must be cleared in invalidation, destroy, and reschedule paths.
- Browser timers must not run during SSR. Current code uses `isServer` plus the test platform check.
- Node timers that can keep the process alive should use `.unref?.()`.

## AsyncSignal Test Patterns

Use the current test helpers already present in nearby tests:

```typescript
await withContainer(async () => {
  const signal = createAsync$(async () => 42, { expires: 50 }) as AsyncSignalImpl<number>;

  await retryOnPromise(() => {
    effect$(() => signal.value);
  });

  expect(signal.expires).toBe(50);
  expect(signal.poll).toBe(true);
});
```

For mutable counters captured by `$()` closures, use an object ref:

```typescript
const ref = { calls: 0 };
const signal = createAsyncQrl(
  $(async () => {
    ref.calls++;
    return ref.calls;
  })
);
```

Do not capture and mutate primitive `let` bindings from `$()` tests; optimizer serialization can
turn the binding into a const-like captured value.

Compatibility tests should cover deprecated and current options when both are supported:

```typescript
const signal = createAsync$(async () => 42, { interval: -50 }) as AsyncSignalImpl<number>;
expect(signal.expires).toBe(50);
expect(signal.poll).toBe(false);
expect(signal.interval).toBe(-50);
```

## Serialization And Inflation

When a core value gains serialized state:

1. Update the serializer and inflater together.
2. Keep array positions or marker encodings documented in the code that owns them.
3. Add a round-trip test in `shared/serdes` or the closest subsystem.
4. Check SSR and client resume behavior when the value affects resumed or streamed state.

For AsyncSignal fields, inspect the serdes tests that deserialize async signals and verify
`expires`, `poll`, stale value, and error/loading state behavior.

## VNode, Cursor, And Streaming

Core rendering changes often cross multiple boundaries:

- SSR emits HTML, VNode data, event data, state, and sometimes streamed patches.
- Client startup materializes VNodes lazily from DOM plus `qwik/vnode` data.
- Cursor work must preserve render promise resolution and not orphan paused cursors.
- Qwikloader changes need behavior tests because they run outside normal framework code.

When touching these areas:

- trace the owner of each marker or ID from emitter to consumer;
- keep numeric/string encodings deterministic;
- test root and nested/container cases when a feature can appear in both;
- include streaming or out-of-order cases when state can arrive after initial event listeners.

## QRL And Optimizer-Facing Runtime

- Use `$`-suffixed APIs and `$()` in tests when a QRL boundary is expected.
- Avoid manual QRL construction unless nearby tests already use it for the same reason.
- If runtime behavior relies on optimizer output, inspect the optimizer transform and snapshot too.
- For event or JSX attribute changes, keep `event-names`, JSX runtime, qwikloader, and optimizer
  behavior aligned.

## Focused Verification

Use the closest command first:

```bash
pnpm vitest run packages/qwik/src/core/reactive-primitives/impl/async-signal.unit.tsx
pnpm vitest run packages/qwik/src/core/shared/serdes/serdes.unit.ts
pnpm vitest run packages/qwik/src/qwikloader.behavior.unit.ts
pnpm build.core.dev
pnpm api.update
```

Use e2e only when unit/spec tests cannot cover the behavior, such as real browser event timing,
streaming, navigation, or integration with fixture apps. For Qwik e2e, load
`qwik-e2e-verification`.

Never use `pnpm test.unit` for agent verification in this repo.

Unit-harness traps (cause false results in `ssrRenderToDom` specs):

- Inline `$()` QRLs are re-created per render (no optimizer), so prop-identity-sensitive tests need
  module-scope QRL constants to discriminate.
- The harness materializes full parent chains, so resume-only code paths gated on missing parents
  (e.g. reset's `resetOwner` fallback) never run — e2e is the authority for resumed behavior.
- A captured plain-object flag serializes at SSR and resumes as a frozen copy; gate flaky fixtures
  on `isServerPlatform()`, not captured mutable state.

## ErrorBoundary (experimental `errorBoundary`)

Where things live: `errorBoundaryCmp` (`shared/error/error-boundary.ts`); SSR catch + inert marking
(`ssr/ssr-render-jsx.ts`); fallback hosts (`control-flow/suspense.tsx`); client routing + reset
(`client/dom-container.ts`); display membrane (`shared/error/error-handling.ts`); store field
(`use/use-error-boundary-store.ts`).

Invariants (stateless model):

- The boundary never serializes error state: `store.error` is a non-enumerable store-target field.
  Keep it non-enumerable; never add an ErrorBoundary carve-out to the serializer.
- Single display membrane `redactBoundaryErrorForDisplay(error, dev, transformError)`: the store
  holds the RAW throw; projection happens only at display sites; `canSerialize` plays no role. A
  `transformError` projection must be a readable `Error` or it redacts; returning `undefined`/
  `null` declines and the default policy applies. The membrane never throws — every raw-value probe
  stays fail-closed against hostile objects.
- Only the framework brand set by `redactToGeneric` passes the membrane as already-redacted; an app
  error's own `digest` field is data and must not skip prod redaction. The prod-redacted error
  carries no `cause` and no custom fields.
- `PublicError` is the one unredacted prod lane: guarded `instanceof` (construction = consent),
  identity pass-through, no digest attached. Resume identity rides the `q:pe` marker inside the
  ordinary Error payload; inflate restores the prototype and never assigns the marker as a field.
- Prod-mode asserts live at helper level (`dev: false`) or in the `error-boundary.prod` e2e — the
  unit harness compiles `isDev=true`.
- The SSR catch never buffers streaming: it marks the store, fires `onError$`, marks content inert,
  and returns null; the fallback host renders the fallback. Queued frames inside an inert content
  host are discarded (superseded promises stay observed); pre-catch content keeps hide-don't-unwind;
  a discard site must never skip StackFns.
- Host styles are static literals; the `qErr` swap script owns the errored end state in the DOM.
  Never reintroduce a live style subscription on the hosts — a resumed recompute would un-hide
  inert content. Swap by origin: in-place under `q:ebf` via `qErr`; deferred segment via the `qO`
  shell (`q:rp`); inline content must never sit under `q:rp`.
- `markBoundaryErrored` is the only server error writer; `onError$` receives the original `Error`
  (a non-Error throw arrives wrapped with the raw value as `cause`); `store.error === undefined`
  means "no error" and every writer normalizes a thrown `undefined`.
- Reset re-renders the AUTHOR: the owner walk skips `_suC`/`_ebC` parents but stops at an `_ebC`
  with an in-memory error (an errored boundary authors its fallback). Reset must work with
  `store.error` undefined — that IS the resumed errored state; browsers then resolve the
  serialized `resetOwner`, which already points at the true author. Never mark a resumed boundary
  directly: its SSR projection was abandoned, so rendering its Slot yields an empty subtree.
- Errored boundaries re-derive by re-running the children through the author re-render; a
  task-phase SSR throw does not re-derive (documented developer responsibility). `store.$onError$`
  is server-only; the client fires the serialized `props.onError$` — refire on client
  re-derivation is documented, not deduped.
- Closest boundary catches; a throwing fallback escalates past detached-`$fallback$` boundaries.
  Function children (SSR) are sentinel-marked so throws route to the boundary; success stays
  invoke-and-discard; a missed enqueue site fails back to uncaught-throw, never corruption.

## Keep This Reference Fresh

Before finishing a core task, ask:

1. Did current source contradict anything in this reference?
2. Did the task teach a durable pattern that future core work should reuse?
3. Is the lesson specific enough to belong here rather than in `.ruler/AGENTS.md`?

If yes, update this file in the same task when scope allows it. Prefer replacing stale text over
appending another long lesson.
