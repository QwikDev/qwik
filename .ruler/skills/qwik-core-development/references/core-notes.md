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
- Polling belongs in `usePoll` from `@qwik.dev/utils`, not the computed engine.
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
- `invalidate(info)` keeps the cached value readable while recomputation is pending.
- `clear()` drops the cached value before invalidating, so readers wait for the replacement.
- Cleanup callbacks run before recomputation and when the subscriber is disposed.
- Serialization reads internal cached state and must not start computation.

## Serialization And Inflation

When core state changes its serialized representation:

1. Update serializer and allocator/inflater together.
2. Preserve existing wire IDs unless the protocol is intentionally versioned.
3. Encode serialized QRL root IDs as chunk-to-symbol-to-capture delta chains.
4. Add a round-trip test for writer and reader behavior.
5. Keep malformed-input handling fail-closed at the deserialization boundary.

Async computeds serialize as `TypeIds.AsyncSignal`; synchronous computeds serialize as
`TypeIds.ComputedSignal`. Selection uses `ComputedFlags.Async`, not class identity, so resumed and
deprecated-adapter instances follow the same protocol.

### Resolving QRLs During Inflation

Resolve a QRL in `inflate` when the restored value is later read through a **synchronous property
getter**: prop expression sources, and the compute QRL of computed/async/serializer signals when the
value is `NEEDS_COMPUTATION`. A getter cannot await a chunk, so an unresolved QRL makes
`readExpression` throw the import promise at a read that may sit outside any retry boundary.

Anything reached by *invoking* a QRL stays lazy — event handlers, tasks and SSR effect reads all run
inside `retryOnPromise`, which retries a synchronous throw and a rejected returned promise alike.
Never resolve QRLs generically at deserialization: handler QRLs arrive as props `statics`, so
resolving them would import handler chunks that may never run.

A resolved QRL also has its captures restored, which matters because `getCaptured()` discards the
promise from `restoreQrlCaptures` and returns the raw delta string when captures are still pending.

This class of bug cannot fail a spec: the Vitest harness has every chunk loaded, so
`getFunctionOrResolve` returns synchronously. Only a resumed browser run against a cold chunk
exercises it, so verify in e2e.

### Promise Values Cross The Pipeline Boxed

Deserialization signals "still in flight" by being a thenable, so a deserialized `Promise` must
travel wrapped in `PromiseRoot` — `await`, `maybeThen` and `Promise.all` all flatten a bare one, and
a promise-returning accessor can never yield a promise as its value. Allocation is two-phase, so the
unboxed shell is still pending when `getRoot` awaits it: the result is a silent deadlock, not an
error.

Unwrap only where a value becomes user data — capture arrays, signal values, and the eager array
fill — and keep `PromiseRoot` inside `shared/serdes/`. Each unwrap needs a test that fails when it is
removed; mutation-check new ones by deleting the call and confirming a specific test goes red.

Prove promise behavior in the `resume` project. A green `csr` run means nothing here, because
deserialization never runs.

## Task Semantics (v3)

- `useTask$`/`useVisibleTask$` auto-track every reactive read in the body; there is no `track` in
  `TaskCtx`. A task that reads and writes the same store (`state.list.push(...)`, `state.log += x`)
  re-triggers itself and its peers forever — wrap such mutations in `untrack()`.
- The compiler drops `key` on components; remount patterns must use branch flips instead.
- SSR serializes a `VisibleTaskSubscription` (wire `Phase.VisibleTask`) owned by the active SSR
  scope; the qvisible/qinit attr captures reference it and `_visibleTask` only wakes it. Preserve
  nested owner scopes so resume keeps both cleanup lifetimes and scheduler phase ordering.
- `disposeOwner` tears down items in LIFO order so task cleanups can still read fresh values from
  earlier-registered computeds.

## Compiler And QRL Boundaries

- Use `$`-suffixed APIs and `$()` when a QRL boundary is expected.
- Avoid manual QRL construction unless nearby tests already need it.
- If runtime behavior relies on optimizer output, inspect the transform and snapshot.
- For JSX or event behavior, keep compiler output, runtime ABI, and qwikloader aligned.
- In SSR emit, `renderSsrContent` results are user values and are escaped, while the synchronous
  dynamic-content path carries compiler-lowered markup — a local `const el = <span/>` becomes a
  function returning raw HTML. Escaping is per-path, so check which one a change feeds.

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
