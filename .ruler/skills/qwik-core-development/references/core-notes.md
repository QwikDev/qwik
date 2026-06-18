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

- `AsyncSignalImpl` extends `ComputedSignalImpl`.
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

## ErrorBoundary Streaming (experimental `errorBoundary`)

`<ErrorBoundary>` must NEVER block streaming — people nest it freely, so a buffering boundary would
silently kill a page's streaming. On SSR with out-of-order streaming the boundary (`errorBoundaryCmp`
in `shared/error/error-boundary.ts`) renders two display-toggled hosts modeled on Suspense:

- a visible content host (`<div style=display:contents>` wrapping `<Slot>`), and
- a hidden fallback host (`<div q:rp={id} style=display:none>` containing `SSRErrorFallback`).

On a throw, `renderErrorBoundaryFallback` (in `ssr/ssr-render-jsx.ts`) just sets `store.error` and
renders nothing in place. The fallback host (rendered after the content) streams `fallback$(error)`
as an out-of-order **segment** and reuses the Suspense pipeline verbatim:
`writeOutOfOrderResolvedTemplate` + `emitInlineScript('qO(id)')`. The shared `qO` executor
(`out-of-order-executor-shared.ts`) reveals the `q:rp` host and hides its previous sibling — which is
exactly content-host-hidden + fallback-host-shown, no executor change. Resume consistency comes for
free via `qProcessOOOS` / `processOutOfOrderSegmentVNodeData`. Display is driven by `_fnSignal`
reading `store.error`, so the resumed/re-rendered boundary stays consistent with the inline swap.

Key invariants:

- The swap is an inline script (fires as its chunk parses) — it does NOT depend on the client
  re-rendering, so it works before the framework resumes. Client-time errors still use the reactive
  re-render path (`handleError` → `store.error`).
- A SYNC throw emits the fallback segment + `qO(id)` **inline** (`SSRErrorFallback` returns the
  emission promise, awaited in the drain), so the swap lands right after the boundary — NOT via
  `queueOutOfOrderSegment`, which would defer it to end-of-stream and leave the broken content
  visible the whole time. A test asserts the `qO(` position precedes trailing content; keep it.
- An **error-free** boundary ships NO swap JS (no `qO` executor, no `qO(id)` call). The boundary
  reserves its id with `nextErrorBoundaryId()` → `container.nextOutOfOrderId(false)`, which does NOT
  set `outOfOrderUsed`; the executor is armed only when a throw creates the fallback `segment()`
  (which sets `outOfOrderUsed`) and `emitErrorBoundaryFallback` emits the executor right before the
  first `qO(id)`. Per throwing boundary it's one shared executor + one tiny `qO(id)` call (same unit
  cost as a resolved Suspense segment). A test asserts the error-free HTML has no `qO(`/`qInstallOOOS`.
- A deferred child `<Suspense>` that throws routes to the enclosing boundary's `store.$emitFallback$`
  (set by `SSRErrorFallback`), tearing the whole boundary down — not into the Suspense sub-slot.
- A boundary *inside* a `<Suspense>` segment is the one case that still buffers (the segment is
  already buffered, so it doesn't block the shell): `getBufferingErrorBoundaryStore` gates buffering
  on `isOutOfOrderSegmentContainer`.
- Tests must assert BOTH the streamed HTML (content was not blocked) and the post-`qO` DOM
  (content host `display:none`, fallback host `display:contents`). Resume helpers must filter the
  emitted scripts to `qO`/`qInstallOOOS` (running every `text/javascript` script hits debug-build
  refs). See `core/tests/error-boundary.spec.tsx`.

## Keep This Reference Fresh

Before finishing a core task, ask:

1. Did current source contradict anything in this reference?
2. Did the task teach a durable pattern that future core work should reuse?
3. Is the lesson specific enough to belong here rather than in `.ruler/AGENTS.md`?

If yes, update this file in the same task when scope allows it. Prefer replacing stale text over
appending another long lesson.
