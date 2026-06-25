# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-06-25 (PR #299 / [OSS-502](https://linear.app/kunai/issue/OSS-502) **merged** — Bug C `stripExports` dup-imports fix). Active workstream [OSS-499](https://linear.app/kunai/issue/OSS-499): validate **qwik-design-system** under qwik-bundler + the TS optimizer (`experimental: ['tsOptimizer']`); SWC baseline build green. Of the 3 optimizer bug classes the tsOptimizer build surfaced, **two are now fixed**: Bug A ([OSS-500](https://linear.app/kunai/issue/OSS-500), multi-line JSX attr whitespace, PR #297) and **Bug C ([OSS-502](https://linear.app/kunai/issue/OSS-502), PR #299)** — the latter was mis-filed as a rolldown `program`-input bug but is actually `stripExports` running a redundant import-removal pass that re-emitted every surviving import twice; narrowing `stripExportDeclarations` to body-throw fixed it (`filterUnusedImports` already prunes). Remaining: **Bug B ([OSS-501](https://linear.app/kunai/issue/OSS-501), In Progress/scaffolded)** — corrupted re-emission of pre-optimized `@qds.dev/*` libs (a nested `inlinedQrl` in a captures array is wrongly extracted instead of `_inlined_`-hoisted; failing test + 3-phase plan on the ticket). qds docs build 44 → 39 errors (Bug A+C eliminated; remainder is the Bug B family). Convergence **203/9** unchanged; full baseline **1081 → 1084** (+3 Bug C tests). OSS-456 parity continuation + OSS-450 integration umbrella open in parallel.

## Goal

**Long-term project goal**: 100% snapshot test parity between the TS optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`.

**Active workstream**: [OSS-456](https://linear.app/kunai/issue/OSS-456) qwik-router lib processing parity (FAST-TRACK). **`vite-qwik-router` RENDERS end-to-end (dev SSR) and BUILDS green (client + server)** under `experimental: ['tsOptimizer']` — 9 sub-bugs fixed: OSS-457, OSS-459 (PR #211); OSS-458 (PR #215); OSS-460 (PR #217); OSS-461 (PR #219); OSS-462 (PR #221); OSS-463 (PR #222); **[OSS-464](https://linear.app/kunai/issue/OSS-464) pre-transformed `_jsxDEV` handler extraction (PR #225)**; **[OSS-469](https://linear.app/kunai/issue/OSS-469) router-lib `_captures` import-strip fix (PR #226)**. The route-level `testServer$ is not defined` AND the router-library `_captures is not defined` runtime crashes are both resolved. The dev build is now **interactive end-to-end** — counter (OSS-470) AND the `server$` "Test server" RPC ([OSS-472](https://linear.app/kunai/issue/OSS-472): never strip `inlinedQrl` segments) — at parity with SWC. No remaining TS-specific wall: the prod-preview `_run` Q14 affects SWC identically (bundler/runtime, not the optimizer).

**RCA done** (`RCA-vite-qwik-router.md`, PR #223): the failures were NOT router-specific — systemic causes are (1) the optimizer was validated only against idealized convergence snapshots (no absolute paths, no pre-transformed JSX, no bundler build in CI), never real bundler input; (2) multi-pass rewrite coupling. Follow-ups under umbrella **[OSS-465](https://linear.app/kunai/issue/OSS-465)**: Sub-A OSS-466 (bundler-shaped-input test tier), Sub-B OSS-467 (coupling hardening), Sub-C OSS-468 (latent-gap + hygiene closures). [OSS-455](https://linear.app/kunai/issue/OSS-455) bumped to a recurring CI gate.

**OSS-464 — DONE (PR #225, merged).** Root cause confirmed (TS-optimizer gap; SWC handles it): in the bundler pipeline esbuild pre-transforms JSX to `_jsxDEV(tag, { onClick$: () => … })` before the optimizer, and the optimizer never extracted `$`-suffixed handlers from the object-property form (only from raw JSX attributes), so the handler stayed inline and its `server$`-bound `const` got mis-attributed and dropped. Fix: a Phase-1 `Property` extraction branch (`extract.ts`) flagged `isJsxObjectProp`, routed to the bare-value call-site rewrite in both `buildNestedCallSites` (segment path) and `rewrite/inline-body.ts` (inline/hoist path); plus a SWC-matching `children`-key skip in the JSX-bag naming push. Verified end-to-end against the real fixture (client + server build green; `testServer$` crash gone). Seeds the OSS-466 `_jsxDEV` test tier (`tests/optimizer/jsxdev-handler-extraction.test.ts`).

**[OSS-469](https://linear.app/kunai/issue/OSS-469) router-lib `_captures` fix — DONE (PR #226, merged).** Root cause: `collectExtractedCalleeNames` (`rewrite/index.ts`) added `_captures` to the marker-strip set whenever any extraction was an `inlinedQrl`, so `processImports` dropped the `_captures` import. Correct when bodies are extracted into separate segment files (each re-imports `_captures`), but wrong under the server `hoist` strategy where bodies stay inline in the parent and still reference `_captures`. Fix: gate the strip on `!ctx.isInline`; under inline/hoist, let `filterUnusedImports` keep/drop by actual usage (SWC keeps it). Regression test in `router-lib-processing.test.ts`.

**No remaining TS-specific wall for `vite-qwik-router`.** Dev SSR renders (200). Prod preview returns a Qwik Q14 in `writeAttrs` — but the **SWC baseline returns the identical Q14** (at `_run` vs the TS `s_DXSHHFai04s`), so it's a pre-existing fixture/bundler/runtime issue at parity, not an optimizer gap. Repro recipe + the dev-SSR/prod-preview procedure in project memory `[[reference-router-build-repro]]`.

For history of prior workstreams: `git log`, Linear, and the per-PR commit messages.

## Current measurements

| Metric | Value |
|---|---|
| Convergence failing | **9 / 212** |
| Convergence passing | **203 / 212** (95.8%) |
| Full suite passing (baseline) | **1084** |
| Last verified | 2026-06-25 on `main` (post PR #299; OSS-502 stripExports dup-imports fix, +3 tests) |

## CI infrastructure (live)

Landed via [OSS-341](https://linear.app/kunai/issue/OSS-341) / [OSS-342](https://linear.app/kunai/issue/OSS-342). Full mechanism in `REGRESSION.md`.

- **`.github/workflows/test.yml`** — every PR to `main`. Typecheck → full vitest → name-based regression check against `.ci/baseline.json`. Fails the PR if any baseline-passing test ID is now failing.
- **`.github/workflows/update-baseline.yml`** — push to `main`. Auto-regenerates `.ci/baseline.json` via `github-actions[bot]` with `[skip ci]`.
- **Node `>=22`** required — `oxc-parser`'s `experimentalRawTransfer` throws on Node 20.

Local commands:

- `pnpm typecheck` — `tsc --noEmit`
- `pnpm ci:baseline:check <vitest-json>` — local regression check
- `pnpm ci:baseline:update <vitest-json>` — regenerate baseline (rare; auto-update on `main` is preferred)
- `node scripts/diff-platform-results.mjs <vitest-json>` — cross-environment diff tool

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `a23d74f` (post PR #299) | ✅ | baseline | Active workstreams: [OSS-499](https://linear.app/kunai/issue/OSS-499) — qwik-design-system validation under qwik-bundler + tsOptimizer: SWC baseline green; Bug A ([OSS-500](https://linear.app/kunai/issue/OSS-500)) fixed (PR #297) + Bug C ([OSS-502](https://linear.app/kunai/issue/OSS-502), `stripExports` dup-imports) fixed (PR #299); Bug B ([OSS-501](https://linear.app/kunai/issue/OSS-501), lib idempotency) In Progress/scaffolded (failing test + 3-phase plan). qds docs build 44 → 39. **+** OSS-456 — vite-qwik-router **interactive e2e in dev** (counter + `server$` RPC) under `tsOptimizer`, at parity with SWC; OSS-470 + OSS-472 merged. OSS-447 (migration QRL ownership + MIG-06) merged (PR #274); OSS-497 tsdown ESM bundle merged (PR #292 — OSS-450 Sub-F); OSS-498 package rename → `qwik-ts-optimizer` + package README merged (PR #294) — **In Progress until the maintainer runs `npm publish` (the ticket's remaining deliverable)**. Backlog: OSS-448 (scope-aware import DCE — still required for `example_qwik_router_client` flip, alongside the key-prefix/`_wrapProp`/`_fnSignal`/`_rawProps`/transitive-dep families mapped on the OSS-447 comment); OSS-471 (app migration MOVE — parity, not Q14), OSS-473 (spa_init dev-path), OSS-465 RCA follow-ups; OSS-439 (F3); OSS-450 Sub-D. Prod-preview `_run` Q14 at parity with SWC (bundler/runtime). Code-hygiene track: Tracks A, B, C, E fully closed; D paused (OSS-486..491 + the OSS-492 fusion arc OSS-493/494/495/496 all Done; backlog: OSS-489 stage-2 only). |
| `oxc-port` | `073a11d` | ✅ | n/a (Rust) | Long-lived Rust/OXC port. Subtree-imported `qwik-optimizer` as `oxc/`; oxc 0.129 / napi 3. 31/31 cargo tests passing. Not blocking TS work. |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343)) — closed

All 7 sub-issues Done. `generateAllSegmentModules` orchestrator at `src/optimizer/segment/segment-generation.ts` is now a 34-line sequencer over named helpers (down from 580 lines pre-refactor, ~94% reduction). Per-Sub scope in `.planning/specs/segment-generation-refactor.md`. See Linear [OSS-343](https://linear.app/kunai/issue/OSS-343) for rolled-up sub-issue history (OSS-344/345/346/347/356/357/358).

## Refactor track v1 ([OSS-337](https://linear.app/kunai/issue/OSS-337)) — closed

OSS-338/339/340 all merged. See Linear / `git log` for shape; v2 follows the same playbook.

## Parity feature status

Snapshot of features tracked in `CONVERGENCE_FAILURES.md`. F-suffix letters (F1b, F1c) are sub-features that emerged from in-flight rescoping.

| Feature | Status | Notes |
|---|---|---|
| F1 / F1b / F4 / F5 / F6 / F9 | ✅ CLOSED | See Linear for closure PRs |
| F1c | LANDED (foundation only) | Statement-order on `ast-parity/F2`; test won't flip until F2 path/hash/key-prefix bugs also addressed |
| F2 | ✅ CLOSED | [OSS-403](https://linear.app/kunai/issue/OSS-403) umbrella — 10-PR arc (PRs #134–#155); only OSS-410 (surface-only) follow-up remains |
| F3 | OPEN | [OSS-439](https://linear.app/kunai/issue/OSS-439) — 4-5 tests, multi-session |
| F7 | DECLASSIFIED | Per 2026-05-27 audit; fixtures redistributed — see `CONVERGENCE_FAILURES.md` |
| F8 | ✅ CLOSED | Residual `example_qwik_react` has different root cause (migration `_auto_filterProps`) |
| F10 | PARTIAL (1/2) | Sub-A [OSS-437](https://linear.app/kunai/issue/OSS-437) Done; Sub-B (`example_qwik_router_client`) — OSS-447 Done (segment 19 → 1 residuals); flip still blocked by OSS-448 + the residual families on the OSS-447 comment |

Full feature analysis: `CONVERGENCE_FAILURES.md`.

## Most recent meaningful progress

Most recent first. **Each entry is a one-line pointer — drill into the PR, commit message, or Linear ticket for full detail.** Trim entries past ~10.

- **2026-06-25** — PR #299 ([OSS-502](https://linear.app/kunai/issue/OSS-502), **Done**) merged to `main` (`a23d74f`). Bug C of the **qwik-design-system** validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)): the router client-build's `stripExports` (`onGet`, …) duplicated every surviving import → "Identifier X has already been declared". `strip-exports.ts` ran its own import-removal pass that `s.overwrite`-d imports back onto ranges `processImports` had already `s.remove`d (and `filterUnusedImports` re-emitted them too). Fix: narrowed `stripExportDeclarations` to body-throw only; the pipeline's `filterUnusedImports` already prunes post-strip. **The filed premise (rolldown `program`-input) was wrong** — instrumenting the build showed `hasProgram: false`; reproduces with plain `transformModule({…, stripExports:['onGet']})`. +3 tests (the import-pruning assertion re-homed to the pipeline, test ID preserved). Risk: low — strip narrowed, no convergence change. Convergence 203/9; full 1081 → 1084 (+3). qds docs build 44 → 39 (Bug A+C gone; remainder is Bug B/[OSS-501](https://linear.app/kunai/issue/OSS-501)).
- **2026-06-25** — PR #297 ([OSS-500](https://linear.app/kunai/issue/OSS-500), **Done**) merged to `main` (`3ad68fc`). First fix from the new **qwik-design-system** validation workstream ([OSS-499](https://linear.app/kunai/issue/OSS-499)): multi-line JSX attribute strings (`class="…\n…"`, valid JSX) were raw-sliced into the `_jsxSorted` const-props bag with literal newlines → invalid JS ("Unterminated string"). `jsx-props.ts` now folds the value's whitespace to a valid single-line string (tabs→space; continuation-line leading + non-last-line trailing ws stripped; lines incl. empties joined with one space), gated on the slice containing `\n`/`\r`/`\t` so single-line values keep exact bytes. +8 self-documenting unit tests; docs corpus sweep parse-fails 2→0. Also added a CODING_BEST_PRACTICES.md "Comments" section (no WHAT/SWC-reference comments in code; tests document via names). Risk: low — gated on whitespace chars, convergence unchanged. Convergence 203/9; full 1073 → 1081 (+8). Bugs B ([OSS-501](https://linear.app/kunai/issue/OSS-501)) + C ([OSS-502](https://linear.app/kunai/issue/OSS-502)) remain open under OSS-499.
- **2026-06-22** — PR #294 ([OSS-498](https://linear.app/kunai/issue/OSS-498), **In Progress** — publish pending) merged to `main` (`400b5e0`). First-public-release prep: renamed the package `qwik-optimizer-ts` → **`qwik-ts-optimizer`** (name confirmed available) and replaced the published README — the root README was the test-suite doc, now relocated to `tests/README.md`, and root is a proper package README (install, both API entry points with a verified-runnable `transformModule` example, before/after, pipeline phases) drawn from OPTIMIZER.md. Verified: `npm pack` → `qwik-ts-optimizer-0.0.1.tgz`, bundle transform 0 diagnostics, full gate green (203/1073, packaging/docs-only). Ticket stays In Progress until the maintainer runs `npm publish`. OSS-450 publication step.
- **2026-06-22** — PR #292 ([OSS-497](https://linear.app/kunai/issue/OSS-497), **Done**) merged to `main` (`67da372`). Packaging for external npm distribution: swapped the `tsc` library build for a **tsdown** ESM bundle (one entry, `platform:node`, `dts`, `fixedExtension:false` → `dist/index.{js,d.ts}`); all runtime deps stay external by tsdown default (load-bearing for the native oxc-parser/transform `.node` bindings — nothing inlined). `package.json` wired for publish (drop `private`, `files:[dist]`, `publishConfig.access=public`, `sideEffects:false`, npm metadata, `prepublishOnly`); MIT `LICENSE` added to match Qwik core (QwikDev + BuilderIO attribution preserved). Verified: bundle loads + real `transformModule` 0 diagnostics, `npm pack` ships only `dist`+LICENSE, full regression gate green, and end-to-end through qwik-bundler (client + `--app` server build ✓, dev SSR HTTP 200). OSS-450 Sub-F. Packaging-only — no test-count change (203/9, full 1073). **Next: npm publication under `qwik-ts-optimizer`** (rename from `qwik-optimizer-ts`).
- **2026-06-18** — PR #274 ([OSS-447](https://linear.app/kunai/issue/OSS-447), **Done**) merged to `main` (`e02b6b6`). Migration policy for non-marker module-level helpers consumed by exactly one segment: all matching extractions now demote the bare-qrl parent binding (the `movedMarkerSymbols` `break` is gone); `buildMovedQrlSupport` makes the segment own the moved body's `q_<symbol>` declarations + `qrl`/marker-Qrl import deps; the **MIG-06** post-pass (`reexportMovedDeclDependencies`) reexports un-exported `keep` deps of moved decls and demotes cross-segment movers (fixpoint-then-flip per SWC source order); and `isNonReferenceIdentifier` stops property-position identifiers (`document.startViewTransition`) polluting the usage projection. Target segment 19 → 1 residuals; `example_qwik_router_client` **not** flipped — needs OSS-448 + the residual families itemized on the ticket comment. +8 tests (3 e2e + 5 unit); OPTIMIZER.md migration deep-dive updated in-PR. Full 1073 (+8); convergence 203/9.
- **2026-06-11** — PR #287 ([OSS-496](https://linear.app/kunai/issue/OSS-496), **Done**) merged to `main` (`7f69226`). OSS-492 fusion arc closed: Phase-1 extraction hosted as a collector in the gather walk (1 fused walk/module; identity-keyed mid-walk recording, symbolName maps derived post-disambiguation) + `sourceMayContainMarkers` prefilter (565/783 passthrough modules skip the walk). Census 1,999 → 826 walks (−58.7%; arc −66.6%); BENCH-01 −1.7% min interleaved (after fixing a +5% intermediate regression). Standalone `extractSegments` retained as oracle, pinned by `fused-extraction-parity.test.ts`. Umbrella OSS-492 closed. Full 1065 (+4); convergence 203/9.
- **2026-06-11** — PR #285 ([OSS-495](https://linear.app/kunai/issue/OSS-495), **Done**) merged to `main` (`fad6fdd`). OSS-492 fusion step 2: standalone ScopeTracker build walk deleted — the gather walk builds the tracker as it traverses (unconditionally, incl. zero-closure modules; cost budgeted by the OSS-493 spike), freezes on return, then runs the buffered resolution. Census: walks 2,477 → 1,999 (−19.3%), trigger 3→2; wall within variance both benches (BENCHMARKS.md rows). OPTIMIZER.md two-traversal text corrected in-PR. Next: OSS-496 (extraction fusion, 2→1). Full 1061; convergence 203/9.
- **2026-06-11** — PR #283 ([OSS-494](https://linear.app/kunai/issue/OSS-494), **Done**) merged to `main` (`859b64b`). OSS-492 fusion step 1: the gather walk's free-identifier resolution moved replay-time → buffered post-walk via `ScopeQueryTracker.getDeclarationFromScope` — deduped per closure × `(name, scopeKey)`, memoized resolution, first-free-occurrence order pinned by a new internal-at-one-scope/free-at-another differential case. Walk count unchanged by design; the build-before-gather ordering constraint is dissolved. Next: OSS-495 (tracker builds during the gather walk). Full 1061 (+1); convergence 203/9.
- **2026-06-11** — PR #281 ([OSS-493](https://linear.app/kunai/issue/OSS-493), **Done**) merged to `main` (`d07f81b`). OSS-492 fusion-arc gate: walk census (2,477 program walks/pass on the monorepo; full fusion projects −43.8%), `ScopeQueryTracker.getDeclarationFromScope` subclass + 209-fixture equivalence suite (7,952 records, zero mismatches), cost assessment (unconditional bookkeeping on non-trigger modules ~16.3ms/pass < ~28ms projected savings) — **GO** recorded on the ticket comment; kill criterion did not fire. Next: OSS-494 (post-walk free-identifier resolution). Full 1060 (+5); convergence 203/9.
- **2026-06-11** — PR #279 ([OSS-491](https://linear.app/kunai/issue/OSS-491), **Done**) merged to `main` (`7bdf117`). Phase-0.5 flatten work skipped on non-trigger modules: sound `component$` textual prefilter (exactly mirrors the walk's `callee.name === 'component$'` trigger; renamed-import + token-in-comment pin tests) + MagicString lazy on first overwrite. Census: monorepo walks −65%, ctors −99%; wall within variance both shapes — recorded honestly, census is the deliverable (OSS-488/489 pattern). Closes the last unfiled OSS-486 census deferral. Full 1055 (+2); convergence 203/9.
## What to do next

**Two candidate workstreams.** Pick based on appetite — parity progress vs integration milestone.

### Candidate A — Parity continuation (OSS-448 + residual families, blocks OSS-446)

OSS-446 (In Progress; parent of OSS-447 + OSS-448). Convergence at **203/212 (95.8%)** — 9 failing. OSS-446's three documented bugs landed via PR #190.

- **[OSS-447](https://linear.app/kunai/issue/OSS-447)** — migration policy for non-marker module-level helpers consumed by exactly one segment (`useQwikMockRouter` case). ✅ Done (PR #274) — QRL ownership + MIG-06 dependency reexport + property-position usage semantics; target segment 19 → 1 residuals.
- **[OSS-448](https://linear.app/kunai/issue/OSS-448)** — scope-aware import DCE in `filterUnusedImports`. Replace the regex-based identifier test with a scope-aware AST walk; can reuse OSS-446 Bug 3's `buildClosureLexicalScopes` infrastructure.

The `example_qwik_router_client` flip is **not** unblocked by OSS-447 alone — the OSS-447 close-out audit (Linear comment) found it needs OSS-448 **plus** additional families: JSX key-prefix (`0K_*` vs `/K_*`), over-eager `_wrapProp`, missing `_fnSignal` hoists, `_rawProps` over-consolidation, a capture-unpacking gap, and SWC transitive-dependency migration + topological ordering — unfiled, itemized on the ticket for follow-up. After all land, OSS-446 closes on its original acceptance.

### Candidate B — qwik-bundler integration ([OSS-450](https://linear.app/kunai/issue/OSS-450) umbrella)

TS optimizer drop-in for [qwik-bundler](https://github.com/thejackshelton/qwik-bundler). Goal: optional `experimental: ['tsOptimizer']` flag inside `createQwikPlugin`. Convergence is high enough (95.8%) that integration becomes the meaningful next milestone — gets the rewrite running real apps via Rolldown/Vite, provides a real-world test surface beyond the snapshot suite.

Three locked design choices: (1) adapter lives in this repo; (2) reuse the bundler's pre-parsed AST via `meta.ast`; (3) parser-agnostic ESTree-compatible `Program` contract (so Yuku swap-in works in the future).

- **[OSS-451](https://linear.app/kunai/issue/OSS-451) (Sub-A)** — Public API surface. ✅ Done (PR #200).
- **[OSS-452](https://linear.app/kunai/issue/OSS-452) (Sub-B)** — `createOptimizer` factory. ✅ Done (PR #203).
- **[OSS-453](https://linear.app/kunai/issue/OSS-453) (Sub-C)** — `preParsedProgram` thread-through. ✅ Done (PR #205).
- **[OSS-454](https://linear.app/kunai/issue/OSS-454) (Sub-D)** — Bundler-side adapter (qwik-bundler PR #12, open + mergeable).
- **[OSS-455](https://linear.app/kunai/issue/OSS-455) (Sub-E)** — Parity smoke fixture.

Persists across sessions via project memory `[[project_qwik_bundler_integration]]`.

### Trade-off

Candidate A keeps the parity gauge moving (`example_qwik_router_client` flip would take convergence to 204/212). Candidate B doesn't flip any test but unlocks real-world usage of the rewrite + provides a richer test surface. Independent — A and B don't share code paths.

### Other parity backlog

- **[OSS-439](https://linear.app/kunai/issue/OSS-439)** (F3 umbrella — Backlog) — Lightweight inline component support. 4-5 tests. Foundation archived on `archive/oss-439-rawprops-foundation`. Needs 2-3 sub-tickets before resuming. Multi-session workstream.
- **F10 Sub-B** = OSS-446 + OSS-447 + OSS-448 (`example_qwik_router_client`).
- **[OSS-410](https://linear.app/kunai/issue/OSS-410)** — surface-only sibling of OSS-408; target test already passes via compareAst normalization but emit divergence is real. Narrow single-session.
- **Standalone fixtures**: `example_invalid_segment_expr1` (single-use binding inlining missing); `fun_with_scopes` (F2 inline-strategy edge cases); `example_use_optimization` (F8 chained-destructure folding, comparable to OSS-363's `flatten-destructures.ts`). File when picked up.

### Held / deferred (not blocking pickup)

- Broader `simplify` coverage beyond `jsx/simplify.ts`'s current scope.
- Perf (hygiene track D, **paused** — fusion arc complete): cumulative BENCH-01 3.06× → 2.42×, BENCH-02 4.56× → 3.28× (caps 1.15× / 1.5× still far off); per-step results in `BENCHMARKS.md`. [OSS-492](https://linear.app/kunai/issue/OSS-492) walk-fusion umbrella **closed** (OSS-493/494/495/496 Done; census 2,477 → 826 program walks, −66.6%). Remaining backlog: [OSS-489](https://linear.app/kunai/issue/OSS-489) stage-2 transform batching (deferred on ticket — correctness-bearing edit ordering for a bounded win). File a Linear ticket per workstream; append `BENCHMARKS.md` row before/after for wall-affecting steps.
- De-any in `src/testing/ast-compare.ts` (~150) + `tests/optimizer/` (~22). Mechanical.
- Two [OSS-347](https://linear.app/kunai/issue/OSS-347) backlog candidates (per-iteration `ext` mutation; split `SegmentGenerationContext`'s 28 fields). File when picked up.
- Three [OSS-381](https://linear.app/kunai/issue/OSS-381) Phase 3 candidates — low-value/high-risk per OSS-398 audit.
- Rust/OXC port (`oxc-port` branch). Scaffolding-only; not blocking TS work.

**Pickup-cold reading order**: `OPTIMIZER.md` (Two-namespaces section + Phase pipeline table + marker catalog) → `BENCHMARKS.md` → `CONVERGENCE_FAILURES.md`.

## Maintenance

**You are expected to update this file actively.** Not a passive snapshot — a working artifact.

### Branch scoping

Unlike other files in `.claude/rules/` (CONSTRAINTS, REGRESSION, METHODOLOGIES, CONVERGENCE_FAILURES, LINEAR, OPTIMIZER) which are project-wide rules edited in isolation, **STATE.md is branch-scoped**. It reflects the active workstream of whatever branch it's committed on:

- **Edit/commit on feature & working branches only.** Never edit STATE.md directly on `main` as part of a standalone changeset. Never cherry-pick a STATE.md change to `main`.
- **It travels with merges.** When a feature branch merges into `main`, its STATE.md comes along naturally.
- **A branch without STATE.md is fine.** Create one when meaningful work begins.
- **Refresh on new branches.** Don't carry over stale state from unrelated work.

In short: STATE.md is *authored* on feature branches, *propagates* through merges, and is *refreshed* (not deleted) on new branches.

### When to update

Update when:

- A test flips status (passing ↔ failing).
- A feature's status changes (OPEN → PARTIAL → CLOSED).
- A branch is created, merged, abandoned, or force-pushed.
- A Linear ticket's status changes (Backlog → In Progress → In Review → Done) for tickets the active workstream tracks.
- A feature description is materially corrected.
- A new substantial discovery refines scope.

Don't update for:

- Every commit (commit messages are the source of truth there).
- Mid-investigation debugging.
- Speculation about future features.

Each update:

1. Bump the "Last updated" date.
2. Add a **one-line entry** at the top of "Most recent meaningful progress" — include the PR # + Linear ticket so the reader can drill down. Avoid embedding "what landed" essays here; that's what the PR description, commit message, and Linear comments are for.
3. Trim entries past ~10.
4. Update "Current measurements" if test counts changed.
5. Update "Branches in flight", "Refactor track v2", or "Parity feature status" tables if any changed.

### Keep entries short

The progress log accumulates fast. Each entry should be a **pointer** — date, PR #, ticket, one-line description of what shifted. The full rationale lives in the PR body, commit message, and Linear ticket; STATE.md just needs enough hook to find it. If you're tempted to write more than a sentence or two, the detail belongs in the PR / commit / ticket instead.

## Where to look for more

- `OPTIMIZER.md` — end-to-end pipeline walkthrough with deep dives on capture analysis, migration policy, JSX rewrite, and segment metadata. Read this when onboarding into a new optimizer area.
- [`BENCHMARKS.md`](../../BENCHMARKS.md) (repo root) — perf-history doc tracking BENCH-01 / BENCH-02 wall-time vs the SWC reference.
- `CONVERGENCE_FAILURES.md` — feature breakdown with per-test root causes.
- `CONSTRAINTS.md` — hard rules (read-only directories).
- `REGRESSION.md` — regression invariants (CI-enforced).
- `METHODOLOGIES.md` — process / workflow rules including the Refactoring section and the post-merge routine.
- `LINEAR.md` — ticket management conventions including state UUIDs and auto-assignment.
- `PROJECT.md` — portable-skill bindings (tracker, state file, stand-up + wrap-up config).
- `.github/workflows/README.md` — CI workflow documentation.
- Linear [OSS-343](https://linear.app/kunai/issue/OSS-343) — refactor track v2 parent (rolls up sub-issue completion).
- `git log` — full history of merges; commit messages carry the *why*.
- `pnpm vitest convergence --run` — current parity measurement.
- `pnpm ci:baseline:check <vitest-json>` — local regression check against stored baseline.
- `tests/optimizer/failure-families.test.ts` — secondary signal (broader, less strict than convergence).
