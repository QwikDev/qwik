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

## ErrorBoundary (experimental `errorBoundary`)

Prescriptive notes for touching ErrorBoundary code — what not to break, and the traps that cause
false passes. (Read the source for the full mechanism.)

Where the pieces live: `errorBoundaryCmp` (`shared/error/error-boundary.ts`); SSR catch + inert
(`ssr/ssr-render-jsx.ts`: `renderErrorBoundaryFallback`, `catchToErrorBoundary`,
`markErrorBoundaryContentInert`); the SSR fallback hosts (`control-flow/suspense.tsx`:
`SSRErrorFallbackHost` picks at drain time between `SSRErrorFallbackInline` = in-place/`qErr` and
`SSRErrorFallback` = deferred/`qO`); client routing (`client/dom-container.ts`: `handleError`, the
`qerror` listener); shared helpers (`shared/error/error-handling.ts`: `markBoundaryErrored`,
`fireOnError`, `toSerializableBoundaryError`, `isErrorFromDeferredSegment`, `ErrorBoundaryStore`).
Gated on the `errorBoundary` flag (the component throws when it's off).

### Keep these invariants
- **Never let the boundary buffer or block streaming.** Content streams live into the `content-host`;
  on a throw `renderErrorBoundaryFallback` sets `store.error` + fires `onError$` once + marks content
  inert + returns `null`. It must NOT render the fallback itself — a sibling `fallback-host` does.
- **Keep the origin-based swap split, decided at fallback-host DRAIN time** (`SSRErrorFallbackHost`):
  an in-place error (already in `store.error` when the host drains) swaps inline via `qErr` (`q:ebf`
  host) even when OOOS is enabled; only a deferred-segment error keeps the `qO` shell (`q:rp` host) —
  including one that raced in before the host drained (`isErrorFromDeferredSegment`). The resume
  invariant: a deferred fallback's vnode-data must travel through a segment (`qProcessOOOS`), and
  inline content must never sit under a `q:rp` host (OOOS resume hijacks it into a template).
- **Write the error state only through `markBoundaryErrored(store, error)`** — it sets `store.error`
  via `toSerializableBoundaryError` and fires `onError$` exactly once with the ORIGINAL error. Don't
  re-inline that first-catch triple.
- **`onError$` fires once**: server via the `store.$onError$` mirror, client via the serialized
  `props.onError$`. The `$`-mirror is server-only — never read it on the client.
- **Keep `content-host` before `fallback-host`** in DOM/vnode order (the `qO` reveal hides the
  previous sibling, and a later throw must resolve up through the content-host).
- **Keep the `qErr` executor independent of `qO`** (gated on `errorBoundary`, not `suspense`) so a
  plain in-order page still swaps.
- **Closest boundary catches; a throwing fallback escalates.** Both SSR and client skip a boundary
  whose `$fallback$` is already detached and walk to the nearest ancestor; the top-level handler
  terminates the loop.

### Testing gotchas (they cause false passes)
- The unit harness (`domRender`/`ssrRenderToDom`/`streamAndResume`) **simulates** resume — it runs the
  `qO`/`qErr` scripts but not real qwikloader resume/event dispatch, so a spec can pass while a real
  browser breaks. Back every resume/interactivity claim with `error-boundary-streaming.e2e.ts`.
- The flags are build-time-replaced and BOTH `errorBoundary` + `suspense` are ON for the whole unit
  suite, so you cannot toggle them at runtime in a test; the flag-off path needs a separate build.
- For serialization/resume, verify on **`build.core`** (full tsc) — `build.core.dev` masks SSR→resume
  bugs. The unit env defaults `outOfOrder: true`, so the in-order branch only runs with explicit
  `streaming: { outOfOrder: false }` — exercise BOTH branches.
- `qwik-dom`'s `element.querySelector` is NOT subtree-scoped — use `host.contains(el)` for placement.
  Rendering one JSX object in two containers trips "props across containers"; build a fresh tree per test.
- e2e: rebuild with **`pnpm build.core`**, NOT `build.core.dev` — dev builds proxy
  `core.prod.mjs`/`server.prod.mjs` to the dev bundles, so server `isDev` stays true and the suite's
  prod-redaction asserts (`caught: An error occurred`) false-FAIL on unredacted messages. Kill the
  stale `:3301` server (`reuseExistingServer` serves a stale bundle), run `CI=1`:

```bash
pnpm vitest run packages/qwik/src/core/tests/error-boundary.spec.tsx
pnpm build.core && lsof -nP -iTCP:3301 -sTCP:LISTEN | awk 'NR>1{print $2}' | xargs -r kill
CI=1 pnpm playwright test e2e/qwik-e2e/tests/error-boundary-streaming.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

## Keep This Reference Fresh

Before finishing a core task, ask:

1. Did current source contradict anything in this reference?
2. Did the task teach a durable pattern that future core work should reuse?
3. Is the lesson specific enough to belong here rather than in `.ruler/AGENTS.md`?

If yes, update this file in the same task when scope allows it. Prefer replacing stale text over
appending another long lesson.
