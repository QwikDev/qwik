# Qwik Core Notes

Use this reference only after loading `qwik-core-development` and only for core runtime work that
needs more detail than the skill body.

## Maintainer Bias

- Isolate the broken invariant before changing code.
- Keep protocol producers and consumers together.
- Add focused regression tests beside changed behavior.
- Preserve compatibility paths deliberately and test them.
- Avoid broad rewrites, unexplained fallbacks, and temporary debug code.

## Browser DOM Test Doubles

- Keep browser runtime semantics independent of incomplete test DOM behavior.
- When `@qwik.dev/dom` lacks an API used only by CSR tests, model that API in the test instead of
  adding a runtime compatibility branch. If production server code needs it, fix `@qwik.dev/dom`.

## Source Map

```text
packages/qwik/src/core/
  component/                 component setup and ownership
  dom/                       templates, effects, branches, content, slots, collections
  reactive/                  signals, computed values, stores, subscriptions
  runtime/                   owners, invoke contexts, scheduler, hooks, tasks
  shared/qrl/                QRL classes and helpers
  shared/serdes/             serialization, inflation, root references
  tests/                     compiler-backed CSR and SSR behavior specs
packages/qwik/src/server/    target-native SSR runtime
```

Do not restore removed VNode, cursor, legacy SSR-JSX, `reactive-primitives`, or `use/` pipelines.

## Computed Model

- `reactive/computed.ts` owns the single synchronous and asynchronous engine.
- A computed switches on `ComputedFlags.Async` when its compute function returns a promise.
- `AsyncSignal` is only a deprecated `Computed` adapter; `useAsync*`, `AsyncCtx`, and async option
  types remain compatibility aliases.
- New code uses `useComputed*`, `ComputedSignal`, `ComputeCtx`, and `ComputedOptions`.
- `ComputeCtx` provides `track`, `previous`, `info`, `cleanup`, and `abortSignal`.
- Compiler-backed async code uses the existing `_await` transform so dependency collection continues
  after an `await`; tests should exercise this through the existing compiler harness.
- Reading `.value`, `.pending`, or `.error` may start computation. During SSR, an unresolved compute
  propagates its promise through the established retry path.
- `AbortError` is cancellation, not a user-visible `.error`.
- Poll timers never run during SSR and Node timers use `.unref?.()`.
- `clientOnly` values are scheduled for eager resume and cannot be read during SSR without an
  initial value.

When changing computed behavior, inspect:

- `packages/qwik/src/core/reactive/computed.ts`
- `packages/qwik/src/core/reactive/computed-qrl.ts`
- `packages/qwik/src/core/reactive/public-api.ts`
- `packages/qwik/src/core/reactive/public-types.ts`
- `packages/qwik/src/core/reactive/async-signal.ts`
- `packages/qwik/src/core/shared/serdes/serialize.ts`
- `packages/qwik/src/core/shared/serdes/allocate.ts`
- the closest computed or async signal unit/spec test

## Computed Invariants

- `.value`, `.pending`, and `.error` share the computed subscriber source and notify dependents when
  observable state changes.
- `invalidate(info)` records the latest info, marks the value dirty, aborts current work, and notifies
  subscribers.
- `allowStale: false` drops a cached value on manual invalidation and non-polling expiration.
- `expires` controls expiration duration; `poll` controls automatic recomputation.
- Deprecated `interval` maps positive values to polling and negative values to stale-only expiry.
- Cleanup callbacks run before recomputation and when the subscriber is disposed.
- Serialization reads internal cached state and must not start computation.

## Serialization And Inflation

When core state changes its serialized representation:

1. Update serializer and allocator/inflater together.
2. Preserve existing wire IDs unless the protocol is intentionally versioned.
3. Preserve absolute root IDs for QRL captures.
4. Add a round-trip test for writer and reader behavior.
5. Keep malformed-input handling fail-closed at the deserialization boundary.

Async computeds serialize as `TypeIds.AsyncSignal`; synchronous computeds serialize as
`TypeIds.ComputedSignal`. Selection uses `ComputedFlags.Async`, not class identity, so resumed and
deprecated-adapter instances follow the same protocol.

## Compiler And QRL Boundaries

- Use `$`-suffixed APIs and `$()` when a QRL boundary is expected.
- Avoid manual QRL construction unless nearby tests already need it.
- If runtime behavior relies on optimizer output, inspect the transform and snapshot.
- For JSX or event behavior, keep compiler output, runtime ABI, and qwikloader aligned.

## Focused Verification

Start with the narrowest applicable command:

```bash
pnpm vitest run packages/qwik/src/core/reactive/async-signal.unit.ts
pnpm vitest run packages/qwik/src/core/serdes.unit.ts
pnpm vitest run packages/qwik/src/core/tests/computed.spec.tsx
pnpm build.core.dev
pnpm api.update
```

Use e2e only for behavior that depends on a real browser, streaming, navigation, or fixture wiring.
Never use `pnpm test.unit` for agent verification in this repository.
