# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-07-17 (**OSS-541 de-any umbrella — both subs landed.** PR #363 ([OSS-542](https://linear.app/kunai/issue/OSS-542)) **merged → `main` (`170ffee`)**: `tests/optimizer` specs de-anied — oxc-walker callbacks typed (`AstNode`/`AstFunction`, `this.skip()` via contextual `this`), the two near-dup dollar-arg helpers unified, shared `tests/optimizer/helpers/ast-normalize.ts` normalizer extracted; test-only, 0 src, gate green, OSS-542 **Done**. PR #364 ([OSS-543](https://linear.app/kunai/issue/OSS-543)) **In Review**: `src/testing/ast-compare.ts` differential oracle de-anied (~164 `any` across 71 normalizers → guard-based narrowing via reused `isAstNode` + local `isRecord`/`asArray`, no `as` casts), verified **bit-identical** (full pass/fail set unchanged — the acceptance criterion for a differential oracle). Convergence **203/9** unchanged. **NEXT: land #364 → OSS-541 closes; then OSS-456 parity, OSS-450 qwik-bundler integration, or the OSS-540 #4 qds head-to-head.**)

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
| Full suite passing (baseline) | **1208** all green (post-#363; passing set unchanged — the de-any refactors renamed/removed no test IDs) |
| Last verified | 2026-07-17 — post PR #363 merge (`170ffee`); OSS-543 (#364) verified **bit-identical**: 203/212 convergence + 1208 baseline all pass, 0 regressions |

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
| `main` | `170ffee` (post PR #363) | ✅ | baseline | **OSS-537 hygiene sweep complete — PRs #357/#358/#359 merged, OSS-538/539/540 Done; OSS-540's #4 shifts the `_jsxDEV` qds path (var→const bag for component-param `_fnSignal`), qds head-to-head still pending.** Active workstream: [OSS-499](https://linear.app/kunai/issue/OSS-499) — qwik-design-system validation under qwik-bundler + tsOptimizer. **OSS-536 Done + merged (PR #355) — inline/hoist `_useHmr` HMR-desync fix; full post-fix 29-route qds re-sweep CLEAN (0 TS-only divergences).** OSS-531 + OSS-535 Done + merged (sync$ TS-strip; `_jsxDEV` key-gen); OSS-532 re-diagnosed + parked (qds-side, not ours). SWC baseline green; **bug classes A–O + carousel const-alias (OSS-518) + absolute dev-file-path (OSS-519) + transitive inlinedQrl migration (OSS-520) fixed**; router `<Link>` client-side navigation works end-to-end (browser-verified). Working nav exposed target-page `component$` widget hydration errors: **Header/Playground `qrl is not defined` FIXED ([OSS-524](https://linear.app/kunai/issue/OSS-524)) — dev-mode moved-marker QRL codegen emitted bare `qrl`/no `componentQrl` import; shared `buildMovedQrlDecl` helper, browser-verified**. ****[OSS-517](https://linear.app/kunai/issue/OSS-517) FIXED (PR #338, Done) — const-propagation folded a member read (`ctx.n`) across `ctx.n++` → shifted select-item indices → `selectedLabels` `.length` crash; `readsMutatedObject` guard. FULL dev+prod SSR parity: all 29 qds routes render identically TS≡SWC (dev SSR + prod build/preview), both builds exit 0.** OSS-525 canceled (stale-cache false report). **+** OSS-456 vite-qwik-router e2e at parity. OSS-498 rename → `qwik-ts-optimizer` In Progress until `npm publish`. Backlog: [OSS-512](https://linear.app/kunai/issue/OSS-512) (comment cleanup), OSS-448 (scope-aware import DCE), OSS-471, OSS-473, OSS-465 RCA follow-ups, OSS-439 (F3), OSS-450 Sub-D. Code-hygiene track D paused (OSS-489 stage-2). |
| `oxc-port` | `073a11d` | ✅ | n/a (Rust) | Long-lived Rust/OXC port. Subtree-imported `qwik-optimizer` as `oxc/`; oxc 0.129 / napi 3. 31/31 cargo tests passing. Not blocking TS work. |
| `fix/oss-532-component-const-bag` | local `4a54569` | ❌ (local only) | 203/9, +4 | **PARKED** — the non-spread component const-bag partition fix. Correct SWC-parity but OSS-532's `readOnly` symptom is optimizer-independent (qds playground/resumption bug, reproduces on SWC), so it flips no test and has no confirmed beneficiary. Kept in a worktree; revive if a fixture or the qds-side fix motivates it. |

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

- **2026-07-17** — **OSS-541 de-any umbrella — both subs landed; PR #363 ([OSS-542](https://linear.app/kunai/issue/OSS-542)) merged → `main` (`170ffee`), PR #364 ([OSS-543](https://linear.app/kunai/issue/OSS-543)) In Review.** #363 (Sub A, test-only): `tests/optimizer` specs de-anied — oxc-walker callbacks typed (`AstNode`/`AstFunction`, `this.skip()` via contextual `this`), the two near-dup dollar-arg helpers unified, shared `tests/optimizer/helpers/ast-normalize.ts` normalizer extracted; gate green, 0 regressions, OSS-542 **Done**. #364 (Sub B): `src/testing/ast-compare.ts` differential oracle de-anied (~164 `any` across 71 normalizers → guard-based narrowing via reused `isAstNode` + local `isRecord`/`asArray`, no `as` casts), verified **bit-identical** (full pass/fail set unchanged — the acceptance criterion for a differential oracle; 1208/25 before ≡ after). OPTIMIZER.md → no update (no trigger-checklist file touched).
- **2026-07-16** — **PR #361 ([OSS-541](https://linear.app/kunai/issue/OSS-541) umbrella) merged → `main` (`e685f23`); post-merge wrap-up complete.** Test-infrastructure de-any (labeled refactor, test-only): `jsx-transform.test.ts` (20 `any`s + dead `parseJsx` twin) and `signal-analysis.test.ts` (last 2 `any`s) de-anied; shared typed helper module `tests/optimizer/helpers/parse-nodes.ts` extracted (`parseExpr`/`parseExprWithSource`/`parseJsxElement`/`parseJsxFragment`, asserting node structure so a bad parse throws instead of leaking `undefined`). Gate green — convergence 203/9 unchanged, full 1208 baseline all pass, 0 regressions; the 3 pre-existing SWC-parity unit-fails untouched. Remaining de-any filed as umbrella OSS-541 + subs [OSS-542](https://linear.app/kunai/issue/OSS-542) / [OSS-543](https://linear.app/kunai/issue/OSS-543), all Backlog. OPTIMIZER.md → no update (no trigger-checklist file touched).
- **2026-07-16** — **PR #359 ([OSS-540](https://linear.app/kunai/issue/OSS-540)) merged → `main` (`37382c5`); post-merge wrap-up complete.** Six deferred behavior-normalizing consolidations from the OSS-537 audit; OSS-540 Done, branch deleted, qds dist re-synced (the #4 `_jsxDEV` fix present in the store copy). Five behavior-preserving (`plainQrlName`; `isHtmlElement` unify; `createTransformSession` ×4 body-reparse; `ensureCoreImports`; shared `resolveSameFileImportName`); **#4 = a `_jsxDEV`-path parity fix** — component-param `_fnSignal` prop moves var→const bag matching raw-JSX; **NOT a convergence flip** (all fixtures raw JSX), qds head-to-head is the pending definitive validation. Convergence **203/9** unchanged, full 1188 baseline all pass, +21 tests, 0 regressions. OPTIMIZER.md → no update. Follow-up commit dropped what-comments on the small helpers per review.
- **2026-07-16** — **PRs #357 ([OSS-538](https://linear.app/kunai/issue/OSS-538)) + #358 ([OSS-539](https://linear.app/kunai/issue/OSS-539)) merged → `main` (`5c1155b`); post-merge wrap-up complete.** OSS-537 audit's safe track: #357 the behavior-preserving refactor batch (−225 src LOC — dead code, shared edit/AST primitives, `wireMigration` 3-helper split); #358 test cleanup (−331 LOC, `.ci/baseline.json` mapped 1217→1213). Both Done, branches deleted. Convergence 203/9, baseline 1188.
- **2026-07-15** — **PR #355 ([OSS-536](https://linear.app/kunai/issue/OSS-536)) merged → `main` (`bf53534`; baseline `ec4dc0d`); post-merge wrap-up complete.** OSS-536 flipped to Done; branch `fix/oss-536-inline-hoist-usehmr` deleted local+remote; qds `dist` rebuilt + re-synced (fix present, removed WHY comment gone). The merge also carried a comment-hygiene cleanup (dropped what-comments from the useHmr inline-injection path per CODING_BEST_PRACTICES — `output-assembly.ts` + `module-cleanup.ts`) and the full-sweep STATE record. Baseline **203/9 convergence, 1192 full** (+5 absorbed). OPTIMIZER.md `useHmr` emission-site note already updated in the fix PR → no further audit. **NEXT: OSS-456 parity or OSS-450 qwik-bundler integration.**
- **2026-07-15** — **[OSS-536](https://linear.app/kunai/issue/OSS-536) full post-fix qds re-sweep — CLEAN.** All 23 rendering docs routes swept head-to-head (TS :5200 vs SWC :5201, `deep-sweep.mjs`, clicks every trigger + keyboard): **0 TS-only divergences**. 22 clean-match TS=0/SWC=0 (all 5 fixed routes carousel/checkbox/checklist/collapsible/tree crash→0; 9 prior-MATCH routes incl. `select` no regression), 1 symmetric (`modal` TS=6=SWC=6 byte-identical docs-REPL `[generateJsx]`, not optimizer), 6 identical 404s. Confirms the OSS-536 fix across the whole exercisable surface, not just the 5 crash routes. No code change; PR #355 unchanged.
- **2026-07-15** — **[OSS-536](https://linear.app/kunai/issue/OSS-536) root-caused + FIXED (branch `fix/oss-536-inline-hoist-usehmr`, PR #355 In Review).** The `Missing refElement` assert was a server/client HMR-hook desync: `_useHmr(devFile)` was injected into `component$` bodies only on the segment (client) path (`post-process.ts`), never the inline/hoist (dev-SSR) path — the hook alters serialized vnode/hook layout, so SSR ref offsets desynced from client re-render under interaction. Fix: inject in the inline/hoist emit (`output-assembly.ts`), same gate as the segment path (`mode==='hmr' && devFilePath && isAnyComponentCtx`); extracted a shared body-injection core + `injectUseHmrIntoInlineBody`. Browser head-to-head: crash gone on all 5 routes (carousel 3/3→0, checklist 4/4→0, checkbox 2/15→0, collapsible 3/3→0, tree 1/8→0); TS SSR HTML now emits `q-d:q-hmr` + `q:template` matching SWC. Convergence **203/9** unchanged (no inline/hoist fixture runs in hmr mode); +5 tests; OPTIMIZER.md `useHmr` emission-site note updated (`output-assembly.ts` in trigger checklist).
- **2026-07-15** — **Final QDS compatibility pass ([OSS-499](https://linear.app/kunai/issue/OSS-499)) — DONE; [OSS-536](https://linear.app/kunai/issue/OSS-536) filed (Backlog).** 6-sweep-agent + synthesis workflow swept all 29 docs routes head-to-head (TS :5200 vs SWC :5201). TS≡SWC on every exercisable interactive route (9 MATCH incl. `select`) EXCEPT one TS-only divergence family (5 routes, one root cause) → **OSS-536**: intermittent Qwik `Missing refElement` vnode-materialization assert on ref-bound components under DOM churn (carousel/checkbox/checklist/collapsible/tree), byte-identical failing id, live-reconfirmed (SWC 0 across all). Leading suspect: `_jsxDEV` key-gen (OSS-535 family) for ref-bearing `Render` children. OSS-535 select `insertBefore` crash confirmed cleared. 15/29 routes unexercisable (shared 404s + empty-mdx shells). No code change.
- **2026-07-15** — **PRs #351 (OSS-531) + #352 (OSS-535) merged → `main` (`90f38da`); post-merge wrap-up complete.** OSS-531 (`sync$` serialized-string TS-strip via `stripTypesForSerialization`, `rewrite/rewrite-calls.ts`) + OSS-535 (`_jsxDEV` key-gen by tag-kind + direct-child position via `markDirectJsxChildren`, `jsx/jsx-call-transform.ts`) both Done; merged branches deleted local + remote, integration throwaway removed; qds `dist` rebuilt + re-synced to `main` (531/535 present, parked 532 change confirmed absent). Both browser-confirmed head-to-head vs SWC (select reconciles clean through 6 selections; `sync$` handlers bare-param, no SyntaxError). Baseline **203/9 convergence, 1172 → 1187 full** (+15). Neither file in the OPTIMIZER.md trigger checklist → no doc audit. **NEXT: final multi-agent QDS compatibility pass (exclude known shared TS↔SWC issues).**
- **2026-07-15** — **[OSS-532](https://linear.app/kunai/issue/OSS-532) re-diagnosed; fix PARKED.** Head-to-head browser investigation (SWC control validated distinct via byte-diffed served modules) proved the Textbox `readOnly` toggle is inert on **both** TS and SWC — a qds playground / Qwik-resumption bug (`playground.tsx` skips remount for bindable/function props), NOT an optimizer divergence. The candidate non-spread component const-bag partition fix is correct SWC-parity but fixes no confirmed symptom + flips no test → parked on local `fix/oss-532-component-const-bag`. Finding documented on the OSS-532 comment; ticket stays Backlog (re-home to a qds-side issue).

## What to do next

**OSS-537 hygiene sweep DONE + merged** — OSS-538/539/540 all merged (PRs #357/#358/#359 on `main` @ `37382c5`), wrap-up complete. **One open follow-up from OSS-540:** its #4 changed the `_jsxDEV` qds/router path (component-param `_fnSignal` prop → const bag) with no convergence signal — a **qds head-to-head is the pending definitive validation** (recommended before relying on the output shift, or when resuming OSS-499). **OSS-536 is DONE and merged** (PR #355); **OSS-531 + OSS-535 also Done** (PRs #351/#352); **OSS-532 re-diagnosed + parked** — its `readOnly` symptom is a qds-side Qwik-resumption bug, not an optimizer divergence (see header + branches table).

**QDS compatibility pass ([OSS-499](https://linear.app/kunai/issue/OSS-499)) — DONE.** 29 routes swept head-to-head (TS :5200 vs SWC :5201, 6 sweep agents + synthesis). Of ~14 routes with an exercisable interactive demo, **9 MATCH** (icons, modal, otp, pagination, popover, radio-group, select, tabs, textbox) and **5 share one TS-only root cause → [OSS-536](https://linear.app/kunai/issue/OSS-536)** (Backlog): intermittent Qwik `Missing refElement` vnode-materialization assert on ref-bound components under interaction/DOM churn (carousel/checkbox/checklist/collapsible/tree), TS-present / SWC-absent, live-reconfirmed. Leading hypothesis: the `_jsxDEV` key-gen subsystem (OSS-535 family) not producing stable reconciliation keys for ref-bearing nested `Render` components. **OSS-535's select `insertBefore` crash did NOT reproduce — now MATCH.** Excluded as known-shared: OSS-532 toggle inertness, `modal [generateJsx]`, `select` Promise pageerror, shared 404s. **Coverage caveat:** 15/29 routes unexercisable — 6 shared 404s + 9 empty 0-byte `.mdx` shells (no widget shipped, identical on both servers); those widgets need demo content or a different harness to test.

**[OSS-536](https://linear.app/kunai/issue/OSS-536) — FIXED + fully re-swept (2026-07-15).** Root cause was a server/client HMR-hook desync (`_useHmr` injected on the segment/client path only, never inline/hoist/dev-SSR), NOT `_jsxDEV` key-gen; fix in `output-assembly.ts` (PR #355 merged → `main` `bf53534`; OSS-536 **Done**). Full post-fix 29-route head-to-head re-sweep is CLEAN — 0 TS-only divergences across all 23 rendering routes (all 5 fixed routes crash→0; 9 prior-MATCH routes no regression). **NEXT: pick Candidate A (OSS-456 parity) or Candidate B (OSS-450 qwik-bundler integration) below.**

**Head-to-head browser recipe:** `pnpm build` + rsync `dist/` into the qds pnpm store copy (`../qwik-design-system/node_modules/.pnpm/qwik-ts-optimizer@file+..+TS-Optimizer_*/node_modules/qwik-ts-optimizer/dist/`) + `rm -rf ../qwik-design-system/docs/node_modules/.vite`, then two servers from the qds docs dir — `QDS_TS_OPTIMIZER=1 vite --mode ssr --port 5200` (TS) and plain `vite --mode ssr --port 5201` (SWC). Playwright is installed at the qds root (`pnpm -C ../qwik-design-system exec playwright ...`). Offline alternative: esbuild `jsxDev` → `transformModule` (opts `{minify:'simplify',mode:'hmr',entryStrategy:'smart',isServer:false}`) reproduces `_jsxDEV`-path divergence without a browser. ⚠️ The two servers share the docs dir; verify both respond before sweeping, and clear `.vite` after every dist resync.

**Longer-term candidate workstreams below.** Pick based on appetite — parity progress vs integration milestone.

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
- De-any of the test infrastructure — now tracked: umbrella [OSS-541](https://linear.app/kunai/issue/OSS-541), subs [OSS-542](https://linear.app/kunai/issue/OSS-542) (`tests/optimizer` specs + oxc-walker pattern, low-risk) / [OSS-543](https://linear.app/kunai/issue/OSS-543) (`src/testing/ast-compare.ts` ~150 sites — a differential-oracle **narrowing** refactor, NOT mechanical as previously noted; must verify bit-identical). Seeded by PR #361 (`jsx-transform`/`signal-analysis` done + shared `parse-nodes.ts` helpers). Fixture-string/comment `any` is out of scope.
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
