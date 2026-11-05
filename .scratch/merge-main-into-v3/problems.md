# Open problems from merging `main` into `v3` (2026-11-05)

Merge base `f6c7d6a0b`, main tip `1351e1a7f`. Everything below was left as-is on purpose and needs
a v3 follow-up. Baseline for comparison: v3 `48b56e8a6` has 9 unit failures (7
`insights/.../symbol-tile/index.unit.ts`, 2 compiler acceptance sweep for `error-handling`
`onerror`/`rederive`).

## Tooling

- **vitest pinned to 5.0.0.** Main's `a1f47aef6` bumped it to 5.0.5 for a security advisory. On
  5.0.5, v3's multi-project resume harness (`packages/qwik-vite/src/plugins/test-resume.ts`) is
  nondeterministic: v3 alone gives 23 to 459 failures per run ("ssrRender requires a resume or ssr
  test target", "Cannot find module '….qwik-test-root-0.tsx'"). Make the harness deterministic
  (its registry and target are process-global across projects), then take 5.0.5.
- **`pnpm api.update` fails on v3 HEAD already**: `core/dom/effect/effect.unit.ts:219` passes a
  `string` where `AttributeBindingKind` is expected. The API reports in this merge were generated
  with that line cast locally (the cast is not committed).

## Router

- **`Link` `data-q-route`** (main's change in `link-component.tsx`): the route lookup
  runs inside `untrack(() => matchRouteTree(routes, …))`. The v3 compiler captures `routes`, which
  holds page-loader functions, so resume serialization throws "Cannot serialize function". 13
  `|resume|` tests in `link-component.unit.tsx` fail, including v3's existing prefetch tests.
- **`Link` `data-navigating`**: the csr test "marks the link with data-navigating until navigation
  resolves" still sees the attribute after the navigation promise resolves.
- **`window._qRouterInitNavigate`**: main sets it inside `goto` to `goto` itself. On v3 that makes
  the `goto` QRL capture itself and SSR throws "Cannot access 'goto' before initialization", so
  the assignment was dropped. `spa-init.ts` still reads it and falls back to the old init-mode
  popstate path. Needs a v3-shaped way to hand the resumed `goto` to init-mode popstate.
- **Navigation preparation for loader redirects** (main `cf8f82404`, `d7439be7a`): main's
  `prepareNavigation`/`beginNavigation` layer was not ported, because v3 drives navigation from
  `useTask$`. Main's `qwikrouter-test` `loader-redirect` fixture changes and the new
  `loader-redirect/list` route were kept. The compiler acceptance sweep fails on
  `loader-redirect/index.tsx` ("pipeline does not support: a non-QRL computed text hole"), and
  the matching e2e cases are expected to fail.
- Unverified from the router merge: SSR eTag reuse in `route-loaders.ts` relies on `lastFetch.e`
  surviving serialization in the `useComputed$` closure. The `Form` submit lock relies on core
  running and awaiting handlers in order.

## Core: main regression tests kept but failing on v3

These were ported to v3's `testRenderer` harness unchanged in what they assert. They fail because
v3 lacks main's v2 fixes.

- `core/tests/component.spec.tsx` (csr 7, resume 6): `preserves state and prop bindings when
  props add/change/remove/same`, `should render a deep prop in a child that can rerender`,
  `should rerender a child whose prop reads deep into an object holding a function`, `should
  rerender a module-scope child when its var props become empty`, `should render a component
  stored under two store keys after resume`.
- `core/tests/loops.spec.tsx` (csr 5, resume 4): `should capture the reassigned value of a local in
  loop handlers`, `should preserve assigned captures through callbacks passed to helpers`, `should
  preserve captures across repeated helper calls and branches`, `should preserve captures assigned
  by array and object patterns`, `should render loop handlers from functions declared after the
  return`.
- `core/tests/use-on.spec.tsx` (csr 2, resume 2): `should not add useOn handlers twice to a JSX
  node reused across renders`, `should keep re-rendering a reused JSX node that only has useOn
  handlers`. Main's test called `useIncrement(b)` inside JSX, which v3 rejects (and main's
  `use-method-usage` lint rule flags), so it was renamed to `createIncrement`.
- `core/tests/projection.spec.tsx` (resume 1): `should render nested Slots in the owner of default
  content`.

## qwik-vite: smart-strategy tests for v2 optimizers

Main's smart-mode chunking (`0452ebe43`, `37337d819`, `759884ecd`, `42a901d36`) lives in the Rust
and TS optimizers. v3 transforms with `@qwik.dev/compiler`, so these tests fail: `event-qrls.unit.ts`
(32), `rolldown.unit.ts` "smart/component separates client-only code" (16), `plugin.unit.ts`
"smart preserves optimizer entries and SSR stripping inside custom hooks" (4). `plugin.ts` keeps
main's `isSmartClientOnly` grouping, which classifies v3 segments with the ts-optimizer predicate
`isStrippedSegment`. Check whether that holds for compiler segments.

## Docs

- `packages/docs/scripts/build-search-index.unit.ts` expects `/api/qwik/#usesignal-variable`.
  v3's API docs list `useSignal` as a function.

## Decisions made while resolving (for review)

- The serializer now ships as `@qwik.dev/core/internal/serializer` on v3 too. It takes stateful
  runtime from `@qwik.dev/core` (v3's server convention), not `@qwik.dev/core/internal`. Core
  imports serializer types through the subpath specifier so `core.d.ts` does not inline its own
  copy of `SerializationJournal`.
- `isCopyableCorePath` again allows `version` (for `qwikSymbol`), shared by the server and the
  serializer bundles.
- The BigInt payload limit is error `Q40` on v3, because v3 already uses `Q39` (main uses `Q41`).
- The router lib build sets `minifyInternalExports: false`. A chunk export mangled to `$` was read
  as a QRL marker by linked builds, which emitted `import { Qrl }`.
- v2-only files from main were dropped: q:template handling in `qwikloader.ts` and its behaviour
  test, `core/ssr/ssr-render-slot.ts`, `core/control-flow/pending-utils.unit.ts`,
  `core/tests/async-not-ready.spec.tsx`, and main's `qrl.unit.ts` sync-QRL test, which builds sync
  QRLs the v2 way.
