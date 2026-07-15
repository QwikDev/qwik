# Qwik core agent guide

This file describes the active architecture of `packages/qwik`. The target-native compiler and
runtime are the only production renderer. Do not reintroduce the removed VNode, cursor,
legacy SSR-JSX, old reactive-primitives, or `use/` pipelines.

For the cross-session compiler/runtime handoff, read
[`packages/compiler/TARGET_NATIVE_HANDOFF.md`](../compiler/TARGET_NATIVE_HANDOFF.md).

## Production flow

```text
TSX
  -> @qwik.dev/compiler
  -> target-native CSR or SSR modules
  -> @qwik.dev/core runtime ABI
  -> target-native DOM/SSR runtime
```

The public source API is declared by `src/core/public.ts`. The broader JavaScript exports in
`src/core/index.ts` are the compiler/runtime ABI and are intentionally not all public types.
`@qwik.dev/core/spark` does not exist. `@qwik.dev/core/internal` remains a thin unstable view of
the current runtime ABI, and `@qwik.dev/core/testing` contains only the compiler-backed
test harness; neither entrypoint restores VNode compatibility.

Public renderers accept a root render function:

```ts
render(parent, Root, options?);
renderToString(Root, options?);
renderToStream(Root, options);
```

They do not accept `<Root />`, VNodes, or arbitrary JSX output. The compiler owns the internal
`(props, ctx)` ABI.

## Source layout

```text
src/core/
  public.ts                 public source declarations
  index.ts                  compiler/runtime JavaScript ABI
  shared/                   target-neutral QRL, JSX types, serdes, platform and utilities
  component/                component setup and ownership
  dom/                      templates, effects, branches, content, slots and collections
  reactive/                 signals, computed/async values and stores
  runtime/                  owners, invoke contexts, scheduler, hooks and task setup
  tests/                    compiler-backed CSR/SSR behavior specs
src/server/
  ssr-*.ts                  target-native SSR renderer, output writer and request scheduler
  qwik-copy.ts              explicitly approved stateless copies only
```

## Responsibility boundaries

- Semantic decisions belong in the compiler's semantic plan.
- Templates, ranges, output shape, IDs and target ABI belong in CSR/SSR planning.
- Emitters mechanically serialize target plans; they do not inspect generated strings or infer
  semantics from names.
- Runtime handles only values that are genuinely unknown until execution. Do not move compiler-known
  work into hot paths.
- Prefer synchronous fast paths and `maybeThen()` over unconditional `async`/`await`.
- Do not add allocations, type probing, registries, generic normalization, or another subscriber
  kind to a correct synchronous path without a measured need.
- Internal assertions and expensive diagnostics must be guarded by `isDev`.
- Public standalone reactive `create*` APIs are intentionally unsupported. Setup hooks use `use*`.

## Ownership and reactivity

- Component setup executes once. DOM updates are signal/subscriber driven; components are not
  rerendered as a unit.
- Every subscriber must belong to an owner. Unit tests that construct a subscriber directly must
  use `runWithOwner(createOwner(null), ...)` or the existing compiler-backed test harness.
- The scheduler owns CSR initial subscriber work. One-shot async continuations use `waitFor()`.
- Returned Promises use the existing `maybeThen()`/scheduler paths. Manually thrown Promise support
  is not a public contract.
- Keyed `For` preserves the original raw item for a reused key and updates only its index signal.

## Server bundle boundary

The server is bundled separately, but it must not contain a second stateful Qwik runtime. Signals,
QRLs, owners, invoke contexts, and serialization state are imported from the external singleton
`@qwik.dev/core` module.

`src/server/qwik-copy.ts` is the only relative import boundary into core. It may expose only small,
stateless constants, types, or utilities whose duplicated identity cannot change behavior. Stateful
values must be imported from `@qwik.dev/core`. The server build enforces this rule.

## Testing

Run the smallest relevant test immediately after an implementation edit:

```bash
pnpm vitest run packages/qwik/src/core/path/to/file.unit.ts
pnpm vitest run packages/qwik/src/core/tests/feature.spec.tsx
pnpm vitest run packages/qwik/src/server/path/to/file.unit.ts
```

For compiler-backed behavior, add or update a focused compiler fixture and review every snapshot
change. Never use a bulk snapshot update.

Before handoff, run the relevant core/server suites, `pnpm build.core.dev`, the package
typecheck, `pnpm api.update` for public API changes, and `git diff HEAD --check`. The root pnpm
signature verifier may block wrapper commands locally; do not bypass it with `pmOnFail=ignore`.

Legacy test dispositions are recorded in
`src/core/tests/LEGACY_TEST_MIGRATION.md`. Tests requiring full component rerender or VNode
tree inspection are deliberately excluded; deferred Resource, ErrorBoundary, Suspense, backpatch,
multi-head and OOOS cases remain fixture strings or skipped tests until their designs are settled.
