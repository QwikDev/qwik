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

## Layer A — plan-in / bytes-out fixtures

**Phase-0 scaffold implemented** at `packages/compiler/conformance/layerA/`: fixture dirs
(`fixtures/<name>/input.tsx` + `request.json` + `expected/shell.html`), a harness that compiles
the fixture through `transformModules`, executes the emitted SSR modules against the **built**
`@qwik.dev/core` (one module world — mixing built and source core instances splits the ambient
invoke/owner context), renders with a fixed `instanceHash`, and normalizes the build-stamped
`q:version` to `"conformance"`. Freshness-gated by `layerA.unit.ts`; regenerate with
`UPDATE_GOLDENS=1`. The `plan.json` input and streamed-packet/state extraction land with Phase 3+.

Target fixture shape:

```
fixture/
  plan.json        # linked QwikSsrPlan
  request.json     # serverData, base, locale, instanceHash + id seed,
                   # canned loader results by __id, canned plugin/fetch responses
  expected/
    shell.html
    packets/NNN.bin   # streaming appends in order (absent for non-streaming fixtures)
    state.json        # extracted qwik/state payload(s)
```

Harness protocol: the engine under test is a **generated CLI binary**. The harness runs the
target's generator over ALL fixture plans once and compiles a single fixture-runner binary
(fixture selected by argv) — avoiding per-fixture compiles — then streams request cases through
it: `plan name + request.json` on stdin, length-framed output segments (shell, packets, end) on
stdout. No FFI anywhere; any language qualifies by producing one binary.

## Layer B — source-in cross-check (and golden generation)

The harness compiles fixture TSX through `transformModules`, renders with the **emitted-JS
engine** (golden generator), optionally cross-checks with the JS reference interpreter (a
testing-only tool that renders directly from plan JSON — it catches spec/IR bugs the emitter
cannot see, because the emitter and the goldens share code), and byte-diffs every engine's
output: shell HTML, each `qwik/state` script, each streaming packet.

Fixture sources are extracted from the existing oracles:

- the 116 compiler snapshots (`packages/compiler/src/snapshots/*.snap`) — input TSX + exact
  emitted modules;
- `packages/qwik/src/server/ssr-render.unit.ts` and `ssr-script-emitter.unit.ts` scenarios;
- selected e2e apps (`e2e/qwik-e2e/apps/*`) for realistic pages.

## Resume-level verification

Bytes matching is necessary, not sufficient — the proof that matters is the browser resuming.
`packages/qwik/src/testing/resume-session.ts` is the executable spec: the harness feeds
**native-rendered** HTML into it and runs the existing interaction specs (events fire, captures
restore, computeds wake, Suspense-swapped content behaves).

## CI wiring

- Goldens are committed and stamped with the plan format version; regenerating them
  (`conformance:generate`) is an explicit, reviewed action. CI fails on drift.
- JS job: Layer B + golden freshness.
- Per-native-target job: build runtime + generator, generate fixture-runner, run Layer 0 then
  Layer A.
- Bumping the plan format version without regenerating fixtures fails CI.

## Reporting

The harness reports first-difference context on any mismatch (byte offset, surrounding bytes,
which segment) — mismatches in a 100 KB shell must be diagnosable without manual diffing. The
per-entry native-readiness report (`js-fallback`/`op:'js'` counts per route) is emitted by the
compiler under `nativeTarget` and tracked as the migration progress metric.
