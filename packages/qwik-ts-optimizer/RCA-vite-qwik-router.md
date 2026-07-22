# RCA — `vite-qwik-router` failing to build/run under the TS optimizer

**Date:** 2026-06-08
**Scope:** Why the `vite-qwik-router` fixture (a real Qwik Router app) failed to build, and still fails to run, under `experimental: ['tsOptimizer']` — and whether the cause is deeper than "Qwik Router is hard."

## TL;DR

It is **not** "because of Qwik Router." Router is simply the first **realistic application** run end-to-end through the TS optimizer. Every failure traces to one of two systemic causes:

1. **A validation gap.** The optimizer has been validated almost exclusively against the SWC *convergence snapshot suite* (`match-these-snaps/`), whose inputs are **idealized**: relative source paths, **raw JSX**, hand-written source, and a narrow set of strip configs. The real bundler pipeline produces input shapes the snapshot suite **never exercises** — and there is **no end-to-end bundler build in CI**. Each "router bug" is actually an untested *input-shape assumption* surfacing for the first time.

2. **Multi-pass pipeline coupling.** The parent rewrite is a sequence of string/AST passes that each implicitly assume they "own" the source. Several edit overlapping ranges or depend on ordering in ways the snapshot suite doesn't stress (its inputs rarely trigger two passes on the same construct). Three of the bugs were pure *pass-A-vs-pass-B conflicts*.

The same bugs would surface in **any** non-trivial real app. Router got there first because it's the canonical integration target and it stresses every untested assumption at once.

## Symptom

`pnpm build` / `pnpm dev` / `pnpm preview` of `fixtures/vite-qwik-router` under `optimizer: 'ts'` failed at successive stages: `UNRESOLVED_IMPORT` → `PARSE_ERROR` (duplicate import) → `Expected } but found EOF` → `INVALID_ANNOTATION` (build) → `testServer$ is not defined` (runtime, still open). The same fixture under SWC mode builds and serves cleanly (HTTP 200).

## The bug chain

| # | Ticket | Surface symptom | True root cause | Category | Status |
|---|---|---|---|---|---|
| 1 | OSS-457 | orphan `, qrl) => {` lines | extraction boundary under strip config | C | Done (PR #211) |
| 2 | OSS-458a | `UNRESOLVED_IMPORT` `./chunks/` | `computeRelPath` slash-stripped **absolute** node_modules paths instead of emitting `../../node_modules/…` | A | Done (#215) |
| 3 | OSS-458b | `UNRESOLVED_IMPORT` sibling segs | segment file extension kept source `.mjs`; QRL imports used output `.js` | A | Done (#215) |
| 4 | OSS-459 | `Expected } but found EOF` | segment body boundary under strip config | C | Done (PR #211) |
| 5 | OSS-460 | `PARSE_ERROR` dup `@qwik.dev/core` | `replaceConstants` re-emitted an import `processImports` already removed | E | Done (#217) |
| 6 | OSS-461a | `Expected } but found EOF` | rawProps wrongly applied to an `inlinedQrl` `({track})` context param | C/D | Done (#219) |
| 7 | OSS-461b | (same) | DCE braced-if folds applied with stale offsets when nested | E | Done (#219) |
| 8 | OSS-462 | `INVALID_ANNOTATION` (fatal) | stranded `/* @__PURE__ */` when an `inlinedQrl(…)` call became a `q_` identifier | D | Done (#221, open) |
| 9 | OSS-463 | `testServer$ is not defined` | `removeUnusedBindings` dropped a re-exported `server$` binding — **fix only covered the raw-JSX form** | B/E | Partial (#222, open) |
| 10 | OSS-464 | `testServer$ is not defined` (dev+prod runtime) | optimizer drops the `server$` binding when JSX is **pre-transformed to `_jsxDEV(...)`** by esbuild before the optimizer runs | **B** | **Open — runtime blocker** |

Category key: **A** = path/namespace input assumptions · **B** = JSX input-form assumptions · **C** = strip-config-matrix coverage · **D** = pre-bundled (`inlinedQrl`) lib input · **E** = multi-pass coupling.

## Root cause analysis

### Cause 1 — validated against idealized inputs, never real bundler input

Verified facts about the convergence suite (`tests/optimizer/snapshot-options.ts`, `match-these-snaps/`):

- **No absolute input paths** — every fixture filename is relative (`test.tsx`, `../node_modules/…`). The bundler hands the optimizer **absolute** paths (`getRoot()` + resolved `node_modules/.pnpm/…`). → directly caused OSS-458 (the entire `UNRESOLVED_IMPORT` family). `computeRelPath`'s absolute-input branch had *zero* coverage.
- **No pre-transformed JSX** — every snapshot input is **raw JSX**. In the bundler, esbuild transforms `.tsx` to `_jsxDEV(...)` / `_jsx(...)` calls *before* the qwik optimizer's `transform` hook runs. The optimizer's marker detection + usage attribution is coupled to JSX-attribute syntax (`onClick$={…}`); it mishandles the object-property form (`{ onClick$: … }`). → caused OSS-463/464. **This is the deepest gap and the current runtime blocker.**
- **No real client/server strip matrix on pre-bundled lib input** — convergence fixtures use per-fixture strip flags, but not the bundler's exact combinations (client = `stripEventHandlers` *unset* + `useServer`/`server` stripped; server = `regCtxName:['server']` + `stripEventHandlers:true`) layered over `inlinedQrl`-heavy pre-bundled lib code. → caused OSS-457/459/461.
- **No end-to-end bundler build anywhere in CI** — confirmed: nothing under `.github/` builds a real app. The only signal was a human manually running the fixture. So an entire class of failures was invisible until integration.

**The unifying statement:** *the optimizer's behavior on real bundler-shaped input was never tested.* The convergence suite proves parity with SWC on SWC's own curated fixtures — it does **not** prove the optimizer works on what a bundler actually feeds it.

### Cause 2 — the rewrite pipeline is a chain of coupled string/AST passes

The parent rewrite runs (roughly): `processImports` → `replaceConstants` → `removeUnusedBindings` → rawProps → JSX → DCE → `removeUnusedImports`, plus segment-side equivalents. Each pass largely assumes it owns the source. Three bugs were direct consequences:

- **OSS-460:** `processImports` removed an import range; `replaceConstants.removeReplacedImports` *overwrote the same removed range*, re-materialising the import. Two passes editing one range.
- **OSS-461b:** DCE collected all `if(true/false)` folds in one pass and applied them descending; a fold nested inside another used a stale end-offset. Intra-pass ordering.
- **OSS-463:** `removeUnusedBindings` scans `program.body` for usage, but the re-export it must respect is *appended by a later pass* — so the binding looked unused. Cross-pass temporal coupling.

These don't show up in the snapshot suite because its small, idealized inputs rarely trigger multiple passes on the same construct. Real code (a 1700-line lib, a route with `server$` + markers + JSX) does so constantly.

### Why "it's Qwik Router" is the wrong frame

Router is large and realistic: a `node_modules` lib (absolute paths, pre-bundled `inlinedQrl`, `./chunks/` siblings, PURE annotations) **plus** app routes (`server$`, `routeLoader$`, `component$`, event handlers) **plus** the full dev/prod × client/server matrix **plus** esbuild's JSX pre-transform. It is the first input that exercises categories A–E *simultaneously*. None of the fixes were router-specific — they corrected general assumptions (path namespace, JSX input form, pass coupling). The next real app would hit the same set.

## Contributing process factors (the "vacillation")

Because we fixed reactively, one error message at a time, without this RCA up front:

- **OSS-458 was initially mis-framed** ("strip the `./chunks/` imports") — the real cause was origin relativization + extension. We chased the phantom before reading the SWC reference snap.
- **OSS-463 fixed the wrong layer** — it handled the raw-JSX form, but the real pipeline never produces raw JSX (it's pre-transformed), so the runtime bug (OSS-464) persisted. A pre-transformed-JSX test fixture would have caught this immediately.
- **Split-branch dist fragility** — OSS-462 and OSS-463 landed on separate branches off `main`; rebuilding the linked `dist/` from either branch alone silently dropped the other fix, re-introducing a "fixed" build error. (Mitigation: merge both; longer-term, the integration shouldn't depend on hand-synced `dist/`.)

Front-loading the RCA would have produced the "test against real bundler input, including pre-transformed JSX" insight before, not after, five reactive PRs.

## Recommendations

### Systemic (address the root causes)

1. **Add a bundler-shaped input test tier.** Beyond convergence (SWC parity on idealized inputs), add functional tests that feed `transformModule` the shapes the bundler produces:
   - absolute `node_modules` input paths (covered now by `router-lib-processing.test.ts` — generalize it);
   - **pre-transformed `_jsxDEV(...)` / `_jsx(...)` JSX** (the current gap — there is *no* such test; OSS-464 needs one);
   - the exact client/server strip matrices applied to `inlinedQrl`-heavy lib code.
2. **Add an end-to-end bundler smoke to CI** (OSS-455 was scoped for this). Build `vite-qwik-router` (client + server) under both `swc` and `ts` and diff/assert no build errors. This is the single highest-leverage gap — it would have caught categories A–D before any of them shipped as a surprise.
3. **Resolve the JSX-input contract (OSS-464).** Decide and document who transforms JSX in the bundler pipeline. Confirmed: SWC handles the pre-transformed form; the TS optimizer must too. Make marker detection + usage attribution treat `_jsxDEV`/`_jsx` object-property handlers (`{ onClick$: … }`) equivalently to JSX attributes (`onClick$={…}`). This is the architectural fix, not a point patch.
4. **Make the multi-pass coupling explicit.** Document the pass-ordering contract (what each pass may assume about prior/later passes), and prefer AST-anchored edits over regex/string surgery for the fragile passes (`dead-code.ts` folding, `const-replacement.ts`, the brace/paren scanners) that produced categories E. A shared "edit plan applied once" model would remove the stale-offset class entirely.

### Tactical (this work arc)

5. **Merge #221 + #222** so `main` carries both build fixes; stop relying on hand-merged `dist/`.
6. **Re-validate OSS-463's contract** — its raw-JSX test passes but the real pipeline is pre-transformed; fold its case into the OSS-464 pre-transformed-JSX fix so the contract is tested on the shape that actually occurs.
7. **Hygiene consolidation** — see the companion code-review findings (pending) for specific dedup/consolidation of the rapidly-added helpers and guards.

## Appendix — verification commands

- Convergence input paths all relative: `grep "filename:" tests/optimizer/snapshot-options.ts` (no leading `/`).
- No pre-transformed JSX in snaps: `grep -l "_jsxDEV(" match-these-snaps/` (empty).
- No bundler build in CI: `grep -rl "vite-qwik-router\|tsOptimizer" .github/` (empty).
- SWC serves the route, TS 500s: flip `fixtures/vite-qwik-router/vite.config.ts` between `qwik()` and `qwik({experimental:['tsOptimizer']})`, `pnpm dev`, `curl localhost:5173/`.
