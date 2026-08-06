# 08 — Conformance

Status: design (approved direction, pre-implementation). See [specs/README.md](./README.md).

## Principle

Byte equality across engines is the gate, proven continuously in CI — never by review. The JS
engine (today's emitted-JS SSR) generates the goldens because it is the incumbent behavior the
browser client already depends on.

## Determinism prerequisite

Cross-engine byte comparison requires eliminating the two per-render random inputs: `q:instance`
(`randomStr()`) and, indirectly, anything time-derived. Phase 0 adds test-only options to
`RenderToStreamOptions` — `instanceHash` and an id-seed — used only by the harness. Production
behavior is unchanged.

## Layer 0 — semantics micro-corpora

**Implemented** at `packages/compiler/conformance/layer0/`: `corpora.ts` builds each corpus
deterministically from the JS engine (real `escapeHTML` import; serdes cases render through the
real `renderToStringCompiled` with a fixed `instanceHash` and capture the emitted state
scripts); goldens are committed under `goldens/` (prettier-ignored) and guarded by the
`layer0.unit.ts` freshness test. Regenerate with
`UPDATE_GOLDENS=1 pnpm vitest run packages/compiler/conformance/layer0/layer0.unit.ts`.

One JSON table per HIGH-RISK area of [06-js-semantics-profile.md](./06-js-semantics-profile.md):

- `numbers.json` — curated cases + 10k PRNG doubles: bit pattern (hex) → expected string.
- `tofixed.json` — bit pattern + digits → expected string.
- `json-bytes.json` — `entries` cases (object built in pair order, exposing integer-like key
  reordering) and `value` cases → expected JSON bytes.
- `escape.json` — strings → escaped output (incl. `'`).
- `coerce.json` — tagged value trees → SSR text-interpolation result
  (`value == null ? '' : String(value)`).
- `serdes.json` — tagged value trees (with `shared` identity tags) → the exact
  `<script type="qwik/state" …>` sequence, covering interning, numeric-key folding, RootRef
  promotion, backref paths, BigArray, trailing-`undefined` truncation, builtin types, and a
  **chunked >1024-root case** exercising the JSON re-encode path from
  [04](./04-state-serialization.md).

Non-JSON inputs use a tagged encoding (`{$:'undefined'|'nan'|'-0'|'date'|'map'|'shared'|…}`)
defined in `corpora.ts` (`TaggedValue`) so native harnesses can reconstruct the same values.

An engine must pass Layer 0 before any rendering work — these corpora exist so per-language
rewrites cannot silently diverge on the three classically divergent areas.

**Rust status** (`packages/qwik/native/rust`, crate `qwik-ssr-rt`): **all six corpora pass
byte-exact** (`cargo test`). Number formatting uses `ryu-js` (ECMAScript Number::toString);
`toFixed` is exact big-integer decimal expansion with the spec's ties-toward-larger-n rule;
JSON bytes come from an own writer over the `Value` model (serde_json's bytes differ). The
`serdes` module implements the spec-04 serializer over an `Rc`-identity `SerdesValue` heap:
SameValueZero `addRoot` dedup, RootRef machinery with backref-path promotion, BigArray
worklist flattening, numeric key folding, JS property order, trailing-undefined truncation,
builtins, the raw-vs-reencoded string paths, and script chunking at 1024 roots.

## Layer A — plan-in / bytes-out fixtures

**Phase-0 scaffold implemented** at `packages/compiler/conformance/layerA/`: fixture dirs
(`fixtures/<name>/input.tsx` + `request.json` + `expected/shell.html`), a harness that compiles
the fixture through `transformModules`, executes the emitted SSR modules against the **built**
`@qwik.dev/core` (one module world — mixing built and source core instances splits the ambient
invoke/owner context), renders with a fixed `instanceHash`, and normalizes the build-stamped
`q:version` to `"conformance"`. Freshness-gated by `layerA.unit.ts`; regenerate with
`UPDATE_GOLDENS=1`. The linked `plan.json` is goldened beside the shell, and the reference
interpreter (`interpret-plan.ts`) byte-matches both against the emitted engine.

Streaming fixtures set `"stream": true` in `request.json`: the harness renders through
`renderToStream` (out-of-order), goldens the chunk sequence as `expected/stream.json`, and the
parity test compares chunk boundaries, not just concatenated bytes. Two traps this catches that
in-order rendering cannot: (1) the interpreter must sequence parts with `maybeThen`, never
gratuitous `await`s — extra microtasks shift which serialization roots land in the shell state
script vs the deferred packet; (2) QRL resolution timing must mirror the emitted `.s()` calls
(`SegmentMeta.resolved`) — a lazily resolved `fallback$` settles after the eagerly resolved
suspense content, which reorders roots byte-observably.

Target fixture shape:

```
fixture/
  plan.json        # linked QwikSsrPlan
  request.json     # serverData, base, locale, instanceHash + id seed,
                   # canned loader results by __id, canned plugin/fetch responses
  expected/
    shell.html
    stream.json       # ordered stream chunks (only for `"stream": true` fixtures)
    state.json        # extracted qwik/state payload(s)
```

Harness protocol: the engine under test is a **generated CLI binary**. The harness runs the
target's generator over ALL fixture plans once and compiles a single fixture-runner binary
(fixture selected by argv) — avoiding per-fixture compiles — then streams request cases through
it: `plan name + request.json` on stdin, length-framed output segments (shell, packets, end) on
stdout. No FFI anywhere; any language qualifies by producing one binary.

**Rust status**: **all 29 allowlisted Layer-A fixtures render byte-exact** (`cargo test` in
`packages/qwik/native/rust`). The generator covers statics, signals/stores/computeds/tasks,
events and bind QRLs, component composition (incl. cross-module), local components at any
nesting level, and the QRL invocation convention ([07](./07-native-engine-architecture.md))
applied across every QRL-backed segment: local components, branch arms, collection rows,
suspense content/fallbacks, branch conditions, derived sources, and computed bodies each
generate one symbol-named fn with a trailing `captures` slice rebound like the JS chunk's
`_captures`; call sites invoke through the QRL value, and every component call collects into
its own owner item like `createComponent`. Branch captures serialize the binding's QRL value.
Local components take slots (slot scope + projection closures through the same call machinery
as module components), whole-object identifier props (`member_read` on the props value), and
signal-valued props (sources promote the literal to a `Props` record and root, exactly like
module component calls; the destructure reads the source's current value untracked).
Slot fallbacks render through their segment fn when no projection is registered (captures root
unconditionally like the emitted prep; nothing about the fallback serializes). A sole spread
(`<Badge {...shared} />`) passes the object through as the props value, mirroring
`createComponent(shared, …)`; mixed spreads merge through
`mergeProps` semantics — segments in source order (literal runs grouped between spreads),
later values win, first insertion keeps its key position. Signal sources merge with spreads
too: `_props(mergeProps(…), sources)` — the merged literal keeps the getter, the Props record
carries the sources (statics exclude source keys on the wire), and chunks of
destructured-props components replay the full `const { … } = props` pattern before evaluating,
so every effect tracks every source (the deps in the golden's three subscriptions). Context providers work inside local
component bodies: provision belongs to the declaring local component (never the owner — a
provider inside a nested function must not mark the outer component), whose output wraps in
the `<!c=…>` context-scope range; provider values may be any lowerable expression, evaluated
once at provide time. Module components
with destructured props rebind values at fn start while `component-prop` captures keep passing
the props object — the chunk destructures it. Still inline by design: static-collection rows
(no QRL exists), `forKey` expressions, and slot projection closures. Attr routing rule both non-JS engines share: a `binding-read` attr value
**with a segment** is an expression attr (plain value, no subscription unless a tracked read
occurs); only segment-less reads are signal attrs.
Also covered: slots, branches, collections with rows
and index signals plus static direct-array collections, content effects via `qwik:` internal
plugins, and suspense in both in-order and out-of-order modes (eager content render, fallback
ranges, template packets, the `_qwikS` runtime blob). Known cap: for streaming fixtures the Rust runner byte-compares the
**concatenated** stream (`shell.html`) — per-chunk boundaries (`stream.json`) are not yet
modeled natively.

## Layer B — source-in cross-check (and golden generation)

The harness compiles fixture TSX through `transformModules`, renders with the **emitted-JS
engine** (golden generator), optionally cross-checks with the JS reference interpreter (a
testing-only tool that renders directly from plan JSON — it catches spec/IR bugs the emitter
cannot see, because the emitter and the goldens share code), and byte-diffs every engine's
output: shell HTML, each `qwik/state` script, each streaming packet.

Fixture sources are extracted from the existing oracles:

- the 109 compiler snapshots (`packages/compiler/src/snapshots/*.snap`) — input TSX + exact
  emitted **module code** (they prove emission, not rendered bytes; the Layer-A harness turns
  their inputs into renderer-level byte oracles);
- `packages/qwik/src/server/ssr-render.unit.ts` and `ssr-script-emitter.unit.ts` scenarios;
- selected e2e apps (`e2e/qwik-e2e/apps/*`) for realistic pages.

## Resume-level verification

Bytes matching is necessary, not sufficient — the proof that matters is the browser resuming.
`packages/qwik/src/testing/resume-session.ts` is the executable spec: the harness feeds
**native-rendered** HTML into it and runs the existing interaction specs (events fire, captures
restore, computeds wake, Suspense-swapped content behaves).

Live proof exists end-to-end: `crates/qwik-ssr-host` is a minimal HTTP host whose build.rs
generates render code from a real vite production plan (`ssrPlan: true` emits
`server/q-ssr-plan.json`; the client pass emits `q-manifest.json`, whose `mapping` becomes the
serializer chunk map so QRLs point at real bundles). `e2e/qwik-e2e/playwright.native.config.ts`
boots the host and runs `tests/native-counter.e2e.ts` against
`e2e/qwik-e2e/apps/native-counter` — a real browser resumes Rust-rendered HTML (signal +
computed updates, local-component store writes). `pnpm serve.native [app] [port]` builds any
e2e app and serves it from the Rust host (defaults: native-counter, 3310); the Playwright
config assumes the app is already built. The host also honors `QWIK_SSR_PLAN` /
`QWIK_CLIENT_DIR` directly.

## CI wiring

- Goldens are committed and stamped with the plan format version; regenerating them
  (`conformance:generate`) is an explicit, reviewed action. CI fails on drift.
- JS job: Layer B + golden freshness.
- Per-native-target job: build runtime + generator, generate fixture-runner, run Layer 0 then
  Layer A. **Implemented for Rust** (`ci.yml` `test-native`): restores the qwik dist artifact
  (the embedded qwikloader), then `cargo fmt --check`, `clippy -D warnings`, `cargo test` over
  the engine workspace; change-gated by a dedicated hash (engine workspace + conformance
  goldens + qwik dist key) and wired into the requirements gate.
- Bumping the plan format version without regenerating fixtures fails CI.

## Reporting

The harness reports first-difference context on any mismatch (byte offset, surrounding bytes,
which segment) — mismatches in a 100 KB shell must be diagnosable without manual diffing. The
per-entry native-readiness report (`js-fallback`/`op:'js'` counts per route) is emitted by the
compiler under `nativeTarget` and tracked as the migration progress metric.
