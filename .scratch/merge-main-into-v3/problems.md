# Open problems from merging `main` into `v3` (2026-11-05)

Merge base `f6c7d6a0b`, main tip `1351e1a7f`. Everything below was left as-is on purpose and needs
a v3 follow-up. Baseline for comparison: v3 `48b56e8a6` has 9 unit failures (7
`insights/.../symbol-tile/index.unit.ts`, 2 compiler acceptance sweep for `error-handling`
`onerror`/`rederive`).

## Tooling

- **vitest 5.0.5 (fixed).** It was pinned to 5.0.0 at first because the render projects were flaky
  on 5.0.4+. The cause was vitest's `fsModuleCache` replaying Qwik-compiled modules. Now
  `qwikVite` opts those modules out through `configureVitest`, and vitest is back on 5.0.5.
- **`pnpm api.update` (fixed).** It failed on `effect.unit.ts:219` (a `string` where
  `AttributeBindingKind` was expected) and, after `build.core.dev`, on the serializer entry, whose
  dev shim pointed `@qwik.dev/core/internal/serializer` back at its own sources.

## Router

- **`Link` `data-q-route` (fixed).** The attribute expression captured the matched route, whose
  loader functions can't be serialized, so 13 `|resume|` tests failed. The name is now computed in
  setup.
- **`Link` `data-navigating` (fixed).** The tests waited one tick, but a resumed handler loads
  `nav` lazily; they now use `vi.waitFor`.
- **`window._qRouterInitNavigate` (ported).** `goto` wraps its body in main's `startNavigation`
  closure and hands that to init-mode popstate; `issue9247: keeps Back while the init popstate
  handler is loading` passes. Its sibling `…while the navigation render is held` still fails:
  `#list li` stays empty after the held render.
- **v2 `track` in fixtures (fixed).** `issue9247`, `loader-redirect/list`, `visible-task-order`,
  `error-handling/inert` and `preloader-test/visible-task-dialog` now use v3 auto-tracking.
- **`visible-task-order` e2e (from main):** 3 cases fail (run after the tracked render, parallel
  chunk loads, not holding back renders); the fixture now renders, so these are v3 behaviour gaps.
- **Goto-driven navigation (ported).** Main's 2026-09-30 series (`5fbe367a0`, `315c9993a`,
  `6b40a1706`, `49f841a7e`, `7ab6f1904`) and `5ddb4578e` are in: the three router tasks are gone,
  `goto` loads, refreshes and commits the page, and the navigation promise waits for pending
  loaders. That last part is what keeps a repeated navigation a duplicate during a redirect.
- **Loader redirects (ported, `cf8f82404`).** All 19 `loader-redirect` e2e cases pass. The
  `ListValue` fixture reads `signal.value` in JSX: a v3 setup read is a one-time snapshot.
- **Flaky since the series (open).** `nav` "should restore scroll on back and forward
  navigations" fails ~1–2 in 10 under 2 workers (pre-series baseline: 20/20), and `loader-lifecycle`
  "redirects before a resumed shared loader has a client value" sometimes stays `navigating`.
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
- `_waitOn` is a core setup call the compiler treats like `useTask$` (`blocksRender`), so the
  render waits without a serialized task. The compiler now also reads `@qwik.dev/core/internal`
  as a core source; a core call authored from it keeps its own import.
- The router lib build sets `minifyInternalExports: false`. A chunk export mangled to `$` was read
  as a QRL marker by linked builds, which emitted `import { Qrl }`.
- v2-only files from main were dropped: q:template handling in `qwikloader.ts` and its behaviour
  test, `core/ssr/ssr-render-slot.ts`, `core/control-flow/pending-utils.unit.ts`,
  `core/tests/async-not-ready.spec.tsx`, and main's `qrl.unit.ts` sync-QRL test, which builds sync
  QRLs the v2 way.
