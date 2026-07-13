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
4. Check SSR and client resume behavior when the value affects hydration or streamed state.

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

## ErrorBoundary (experimental `errorBoundary`)

Where things live: `errorBoundaryCmp` (`shared/error/error-boundary.ts`); SSR catch + inert marking
(`ssr/ssr-render-jsx.ts`); fallback hosts (`control-flow/suspense.tsx`, `SSRErrorFallbackHost`);
client routing (`client/dom-container.ts`); shared helpers (`shared/error/error-handling.ts`).

### Invariants
- The boundary never buffers streaming: the SSR catch only sets `store.error`, fires `onError$`,
  marks content inert, and returns `null` — the sibling `fallback-host` renders the fallback.
- Queued frames inside an INERT content host are DISCARDED at drain time
  (`openBoundaryContentScopes` in `ssr-render-jsx.ts`): post-catch siblings, fn children, signals,
  and generators never run, and a superseded promise is never awaited — observe it with
  `.catch(noop)` or a late rejection becomes unhandled. Pre-catch content keeps hide-don't-unwind.
  A discard site must never skip StackFns (structural close frames keep HTML balanced).
- Every probe of a raw thrown value must be fail-closed against hostile objects (revoked Proxy,
  throwing traps/getters): `toSerializableBoundaryError`/digest/redact are try/catch-wrapped, and
  `isPromise`, `checkError`, `getStoreTarget`, and the recursive store-get wrap are guarded.
  `canSerialize` validates an Error's own enumerable fields plus `message`/`stack` reads; a
  `transformError` projection must pass `canSerialize` or it redacts to the generic.
- The swap is decided at fallback-host drain time by error ORIGIN: in-place → inline + `qErr`
  (`q:ebf`), even under OOOS; deferred-segment → `qO` shell (`q:rp`). Inline content must never sit
  under `q:rp` (OOOS resume hijacks it into a template); a deferred fallback's vnode-data must
  travel through a segment.
- `markBoundaryErrored` is the only server error writer: it normalizes (never stores `undefined`)
  and fires `onError$` per caught error + phase (`tagErrorPhase` survives the SSR rethrow).
  First-wins absorption lives at the call sites, not inside it.
- Both callbacks receive an `Error` (`fireOnError`/`toSerializableBoundaryError` coerce): an Error
  throw reaches `onError$` identity-preserved in dev AND prod; a non-Error throw is wrapped with
  the raw value as `cause` (serialized to the dev fallback only when serializable). The
  prod-redacted error must never carry `cause` or custom fields — that would leak the raw error
  through serialized state. A non-Error `transformError` projection redacts to the generic.
- `store.error === undefined` means "no error" — every writer normalizes a thrown `undefined`.
- `store.$onError$` is server-only; the client uses the serialized `props.onError$`.
- `content-host` precedes `fallback-host`; the `qErr` executor stays independent of `qO` (gated on
  `errorBoundary`, not `suspense`).
- Closest boundary catches; a throwing fallback escalates past detached-`$fallback$` boundaries.
- Stray function children (SSR): every child-enqueue site in `processJSXNode` sentinel-marks a
  function so the drain routes its sync throw or awaited rejection to the boundary (phase
  `render`); success stays invoke-and-discard, pinned by spec pending the fn-children RFC. A
  missed enqueue site fails back to the old uncaught-throw behavior, never corruption — keep that
  property. `SSRStream` children are consumed upstream and never reach the drain; the walk's
  internal StackFns must keep hitting the unmarked fn branch. The client silently ignores function
  children — leave it untouched.

### False-pass traps
- The unit harness simulates resume — back resume/interactivity claims with
  `error-boundary-streaming.e2e.ts`. Only `streamAndResume` executes `qErr` scripts; a display
  toggle under plain `ssrRenderToDom` came from the backpatch, not the swap.
- Deserialization is lazy: a poisoned ref into an inert region passes render-only asserts.
  Deserialize every root (`container.$getObjectById$`) to pin the writer protocol;
  `q:prewarm` makes real resume eager.
- Flags are build-time-replaced and ON suite-wide; the unit env defaults `outOfOrder: true`, so
  exercise the in-order branch with explicit `streaming: { outOfOrder: false }`.
- Flag-OFF behavior cannot be asserted in the main suite (compile-time replacement makes it a
  false pass). Put flag-off pins in `*.flag-off.spec.*` — the `vitest.flag-off.config.ts` project
  compiles without `errorBoundary`; the main config excludes that pattern. The client `qerror`
  listener, `unhandledrejection` bridge, and `handleError` boundary walk are flag-gated: flag-off
  `handleError` must rethrow synchronously.
- `qwik-dom` `querySelector` is document-wide — use `host.contains(el)`; build a fresh JSX tree per
  container ("props across containers").

## Keep This Reference Fresh

Before finishing a core task, ask:

1. Did current source contradict anything in this reference?
2. Did the task teach a durable pattern that future core work should reuse?
3. Is the lesson specific enough to belong here rather than in `.ruler/AGENTS.md`?

If yes, update this file in the same task when scope allows it. Prefer replacing stale text over
appending another long lesson.
