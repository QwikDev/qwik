# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-07-09 (PR #326 — [OSS-516](https://linear.app/kunai/issue/OSS-516) **Done**). Active workstream [OSS-499](https://linear.app/kunai/issue/OSS-499): validate **qwik-design-system** under qwik-bundler + the TS optimizer. qds docs build GREEN + dev-SSR renders homepage / `/motion/` / `/code-playground/`; **`/components/*` component-page SSR over-subscription resolved** — the pre-transformed `_jsxDEV` path now reaches raw-JSX parity on reactive props (`_fnSignal`/`_wrapProp`/`_jsxSplit` wiring + a var/const prop-bag split) and props-derived `{...rest}` destructures lower to non-enumerating `_restProps`, clearing all 90 `chore on already-streamed host` warnings (SWC baseline 200/0; [OSS-516](https://linear.app/kunai/issue/OSS-516), PR #326). Convergence 203/9; full 1133 → 1141 (+8). **Next: [OSS-517](https://linear.app/kunai/issue/OSS-517) (Backlog) — the residual `/components/select/` SSR 500 (`selectedLabels` recomputes on a transiently-sparse `itemLabelText`); optimizer output is at SWC parity, so it is a qwik-core runtime reactivity-scheduling divergence, not codegen.** OSS-456 parity + OSS-450 integration open in parallel.

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
| Full suite passing (baseline) | **1141** |
| Last verified | 2026-07-09 on `main` (post PR #326 `3f043ad`; OSS-516 `_jsxDEV` reactive-prop parity + `_restProps`, full +8) |

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
| `main` | `3f043ad` (post PR #326) | ✅ | baseline | Active workstream: [OSS-499](https://linear.app/kunai/issue/OSS-499) — qwik-design-system validation under qwik-bundler + tsOptimizer. SWC baseline green; **bug classes A–O fixed**; docs build GREEN and dev-SSR renders (homepage / `/motion/` / `/code-playground/` 200); **`/components/*` component-page over-subscription resolved** — `_jsxDEV` reactive-prop parity + props-derived `_restProps` (Bug O, [OSS-516](https://linear.app/kunai/issue/OSS-516), PR #326), 90→0 host-subscription warnings. **Next: [OSS-517](https://linear.app/kunai/issue/OSS-517) — residual `/components/select/` SSR 500 (`selectedLabels` on transiently-sparse `itemLabelText`); optimizer at SWC parity → qwik-core runtime scheduling, not codegen.** **+** OSS-456 vite-qwik-router interactive e2e in dev at parity. OSS-498 rename → `qwik-ts-optimizer` In Progress until `npm publish`. Backlog: [OSS-512](https://linear.app/kunai/issue/OSS-512) (comment cleanup), OSS-448 (scope-aware import DCE), OSS-471, OSS-473, OSS-465 RCA follow-ups, OSS-439 (F3), OSS-450 Sub-D. Code-hygiene track D paused (OSS-489 stage-2). |
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

- **2026-07-09** — PR #326 ([OSS-516](https://linear.app/kunai/issue/OSS-516), **Done**) merged to `main` (`b92e6ad`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)): `/components/*` pages over-subscribed the host (90 `chore on already-streamed host` warnings + a `/components/select/` crash) because the pre-transformed `_jsxDEV` path never reached the raw-JSX path's reactive-prop handling. Fix wires `_fnSignal`/`_wrapProp`/`_jsxSplit` + a var/const prop-bag split into the `_jsxDEV` path (`jsx/jsx-call-transform.ts`) and lowers props-derived `{...rest}` destructures to non-enumerating `_restProps` (`rewrite/raw-props.ts`, `collectPropsDerivedLocals`). 90→0 warnings (SWC baseline 200/0); +8 tests; convergence 203/9, full 1133 → 1141 (+8). Residual `/components/select/` 500 split to [OSS-517](https://linear.app/kunai/issue/OSS-517) — a qwik-core runtime reactivity-scheduling divergence (optimizer output at SWC parity), not codegen.
- **2026-07-08** — PR #324 ([OSS-515](https://linear.app/kunai/issue/OSS-515), **Done**) merged to `main` (`4f26ea5`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)), found by sweeping `/components/*` pages: every component page 500'd `ReferenceError: showAll is not defined` writing an element `q:p` prop — `PropsPlayground`'s `component$(({…,showAll})=>…)` with a nested `onClick$={()=>showAll.value=true}` capturing the destructured prop. The component param consolidates to `_rawProps`, but the handler delivers its capture positionally via `q:p` (so `captureNames` is empty), and raw-props consolidation keyed on `captureNames` — so the `q:p` value stayed bare `showAll`. Fix: consolidate the `q:p`/`q:ps` value through the parent's destructured-field map → `_rawProps.<key>` (`bodyConsolidatesToRawProps` + `consolidateQpCaptureValues` in `rewrite/raw-props.ts`), applied at both q:p sites (`buildNestedCallSites` incl. the prod `loopLocalParamNames` fallback + `inline-body.ts`). +2 tests; convergence 203/9, full 1131 → 1133 (+2). **`/components/*` now advance past `PropsPlayground` → next layer Bug O (OSS-516).**
- **2026-07-08** — PR #322 ([OSS-514](https://linear.app/kunai/issue/OSS-514), **Done**) merged to `main` (`59ad949`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)), surfaced once Bug L cleared: `render.tsx`'s `ref={$((el)=>…)}` QRL crashed `Cannot read properties of undefined (reading '0')` in `writeAttrs`. A bare `$()` closure capturing `props` had its inline/hoist call site rewritten to a bare `q_X` with **no** `.w([captures])` (`rewrite/inline-body.ts` `isBare` branch), so the segment body's `const props = _captures[0]` read `undefined`. The default strategy already wired this; only the `isBare` branch was missing it. Fix: append `wCallSuffix(child.captureNames)` in that branch. +4 tests; convergence 203/9, full 1127 → 1131 (+4). **qds dev-SSR now renders homepage + `/motion/` + `/code-playground/` at 200, zero SSR errors.**
- **2026-07-08** — PR #321 ([OSS-513](https://linear.app/kunai/issue/OSS-513), **Done**) merged to `main` (`83a1a11`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)): `search.tsx` `Search_component` 500'd `_wrapProp(...).map is not a function`. In the pre-transformed `_jsxDEV` path (`jsx/jsx-call-transform.ts`), `walkAndWrap` recursively wrapped every reactive `signal.value` member anywhere in a props bag — so a `.value` nested inside a `.map()`/`.length`/ternary/`&&` got wrapped (`sections.value.map(...)` → `_wrapProp(sections).map` → non-array). Fix: position-aware `wrapReactivePropValues` wraps only a bare reactive member at the top of a prop value or a direct `children`-array element; nested reads stay raw. +2 tests; convergence 203/9, full 1125 → 1127 (+2). Isolated to the `_jsxDEV` path (convergence corpus feeds only raw JSX).
- **2026-07-08** — PR #319 (docs — comment rules, no ticket) merged to `main` (`b537ae2`). Hardened `CODING_BEST_PRACTICES.md` "## Comments": the inline-comment-is-a-smell ladder (rename → extract → delete → comment), the **deletion test**, four hard-delete conditions (a test guards it / stated elsewhere / narrates mechanics / labels a section), interface field docs all-or-none, and the doc-adjacency rule. Proven out on `module-gather-walk.ts` (90 → 10 inline lines, zero behavior change); seeds **[OSS-512](https://linear.app/kunai/issue/OSS-512)** (codebase-wide comment cleanup, Backlog). Docs-only; convergence 203/9, full 1125.
- **2026-07-08** — PR #318 ([OSS-511](https://linear.app/kunai/issue/OSS-511), **Done**) merged to `main` (`51a0d7a`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)): a `sync$` const in an event-handler array (`onKeyDown$={[preventKeys, …]}`, navbar-root) emitted a dangling `q_…sync…` ref instead of inline `_qrlSync(fn, str)` → `is not defined` in SSR — the inline/hoist nested-call rewriter (`rewrite/inline-body.ts`) had no `isSync` branch, so a sync marker fell into the QRL-ref path. Fix: handle `child.isSync` first via `buildSyncTransform`. +2 tests; convergence 203/9, full 1123 → 1125 (+2).
- **2026-07-08** — PR #317 ([OSS-510](https://linear.app/kunai/issue/OSS-510), **Done**) merged to `main` (`1d60da7`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)): a closure reading a loop-body const via a computed key (`for (const key of keys){ const keyName=key; useComputed$(()=>propsRecord[keyName]) }`, `useBindings`) crashed `keyName is not defined`. Two capture gaps: (1) computed member/property keys were dropped from free identifiers (oxc-walker's `isBindingIdentifier` ignores `computed`) → `isComputedKeyReference`; (2) block/loop-scoped decls were never in the lexical scope → folded declaration collection into the single gather walk (`addScopeDeclarations`, collect-on-enter, union deferred post-walk, no embedded walk; oracle refactored to match). +8 tests; convergence 203/9, full 1115 → 1123 (+8). Also carries a comment refactor of `module-gather-walk.ts` (90 → 10 inline lines) that drove the PR #319 rule-hardening.
- **2026-07-08** — PR #316 ([OSS-509](https://linear.app/kunai/issue/OSS-509), **Done**) merged to `main` (`ded8cfa`). qds dev-SSR onion-layer ([OSS-499](https://linear.app/kunai/issue/OSS-499)): the carousel `.script.ts` (an import/export-free bare script) crashed `document is not defined` in SSR because the optimizer emitted a non-empty passthrough where SWC emits an empty module, shifting eval order. Fix: `buildPassthroughModule` returns an empty parent module for a bare script (`isBareScript` / `emptyParentModule`). +4 tests; convergence 203/9, full 1111 → 1115 (+4).
- **2026-07-07** — PR #314 ([OSS-508](https://linear.app/kunai/issue/OSS-508), **Done**) merged to `main` (`39436d0`). Surfaced once PR #313 cleared the serverQrl crash in the **qwik-design-system** validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)): a single-use module `const` inlined into a **pre-transformed `_jsxDEV` object-shorthand prop** (`{ id }`) was overwritten in place → invalid `{ obj.a.b }` literal. `propagateConstLiteralsInBody` (`rewrite/const-propagation.ts`) now records each ref's shorthand key (`isShorthandPropertyValue`, exported from `flatten-destructures.ts`) and expands `{ x }` → `{ x: <value> }` when the inlined value isn't a bare identifier. +5 unit tests. Convergence 203/9; full 1106 → 1111 (+5).
- **2026-07-07** — PR #313 ([OSS-506](https://linear.app/kunai/issue/OSS-506) + [OSS-507](https://linear.app/kunai/issue/OSS-507), both **Done**) merged to `main` (`7f57210`). **Closes the Bug G serverQrl SSR crash** in the **qwik-design-system** validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)). PR #311 blamed migration over-eagerness (a downstream symptom); the real root cause (**OSS-507**): on a server build (`isServer:true`, `hoist`), `isServer`/`isBrowser` were never folded inside extracted closure bodies — `replaceConstants` edits the parent MagicString, but the hoist/inline path re-emits bodies as plain strings from `ext.bodyText` that never saw those edits. So the `@qwik.dev/router` lib kept dead `if (isBrowser) …` branches → the `@qwik-router-config` import survived → eager route-tree pull → SSR circular dep → `serverQrl` undefined at `highlight.server.ts`. Fix: `foldConstantsInBodyText` (`rewrite/const-replacement.ts`) reparses the body and applies the same fold; downstream DCE drops the dead branch + import. Plus OSS-506 Q3: `dropTopLevelModuleScopeCaptures` stops a top-level extraction's module-scope refs being serialized as captures (keeps non-serializable singletons out of `_captures`). +9 tests; convergence 203/9; full 1097 → 1106 (+9). Remaining qds bug (carousel `.script.ts` `document is not defined`) is a separate eval-order divergence, tracked under OSS-499.

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
