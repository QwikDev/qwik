# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-07-15 (**PR #349 MERGED to `main`** — OSS-529/530/534 all Done; the stranded-#348 recovery is closed, all three merged branches deleted, qds dist re-synced). Note for future stacked work: #348 (OSS-529/530) had been marked MERGED by GitHub while its code never reached `main` — it was stacked on #347's branch and merged into *that* branch while #347 reached `main` via a separate squash. Recovered by rebasing the OSS-534 branch onto `main` and bundling OSS-529/530 + OSS-534 into PR #349. Active workstream [OSS-499](https://linear.app/kunai/issue/OSS-499): validate **qwik-design-system** under qwik-bundler + the TS optimizer (`experimental: ['tsOptimizer']`). **[OSS-534](https://linear.app/kunai/issue/OSS-534) — DONE (PR #349).** Ported the OSS-529 var/const-bag partition from the raw-JSX path (`jsx-elements-core.ts`) to the production `_jsxDEV` path (`buildJsxSortedCall` in `jsx-call-transform.ts`), which previously merged every spread-carrying component's props into the var bag with a `null` const bag. Faithful port of SWC's rule (validated against `is_const.rs` + `transform.rs`): props before the last spread stay var (a later spread can override); props after all spreads classify by `is_const_expr` / reactive-const, with a component's reactive props always const (the `is_fn` clause); each spread's `_getConstProps` joins the const bag unless the spread is non-final or a var prop follows the last spread (a lone trailing `_getConstProps` renders bare); shorthand props always route to var. **select-root / popover-root / tabs-root now byte-match SWC**; corpus `_jsxSplit` bag divergence **133 → 28 files**. Gate green (203/9 convergence, 1160 full baseline, +12 new tests over current `main`). **CRITICAL finding — the `/components/select/` `insertBefore` crash is NOT the partition gap.** select-root is byte-parity yet the crash persists (SWC clean, TS crashes — verified head-to-head in-browser). Root-caused to a **separate `_jsxDEV` key-generation bug** → **[OSS-535](https://linear.app/kunai/issue/OSS-535) filed (Backlog)**: TS passes through the DEV form's `undefined` key and only keys the outermost element (`!isNested`), while SWC ignores the DEV key/source args and generates positional keys for every component + root HTML (`is_fn || root_jsx_mode`); nested components emit **no key** → runtime reconciliation `insertBefore` failure. The residual 28 corpus divergences are other separate pre-existing gaps (bind:X HTML transform, non-spread const bag, member-expression spread kept raw by SWC, `_fnSignal` `_str` arg, and OSS-535's key/dev-metadata). **`modal`'s `[generateJsx]` error is NOT ours** — reproduces on SWC too. Still open from earlier: [OSS-531](https://linear.app/kunai/issue/OSS-531) (`sync$` TS-annotation leak, Backlog), [OSS-532](https://linear.app/kunai/issue/OSS-532) (Textbox `readOnly` no-effect, Backlog). **KEY unlock:** offline lowered-input harness (esbuild `jsxDev` → `transformModule`) + a corpus `_jsxSplit` bag differ reproduce the `_jsxDEV`-path divergence without a browser; the two-server (TS :5200 / SWC :5201) Playwright sweep proves crashes TS-specific. Convergence 203/9 unchanged. OSS-456 parity + OSS-450 integration open in parallel.

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
| Full suite passing (baseline) | **1172** (PR #349 / OSS-529·530·534 absorbed into `main` baseline) |
| Last verified | 2026-07-15 on `main` @ `248d882` (post PR #349 merge; CI baseline auto-updated) |

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
| `main` | `248d882` (post PR #349) | ✅ | baseline | Active workstream: [OSS-499](https://linear.app/kunai/issue/OSS-499) — qwik-design-system validation under qwik-bundler + tsOptimizer. SWC baseline green; **bug classes A–O + carousel const-alias (OSS-518) + absolute dev-file-path (OSS-519) + transitive inlinedQrl migration (OSS-520) fixed**; router `<Link>` client-side navigation works end-to-end (browser-verified). Working nav exposed target-page `component$` widget hydration errors: **Header/Playground `qrl is not defined` FIXED ([OSS-524](https://linear.app/kunai/issue/OSS-524)) — dev-mode moved-marker QRL codegen emitted bare `qrl`/no `componentQrl` import; shared `buildMovedQrlDecl` helper, browser-verified**. ****[OSS-517](https://linear.app/kunai/issue/OSS-517) FIXED (PR #338, Done) — const-propagation folded a member read (`ctx.n`) across `ctx.n++` → shifted select-item indices → `selectedLabels` `.length` crash; `readsMutatedObject` guard. FULL dev+prod SSR parity: all 29 qds routes render identically TS≡SWC (dev SSR + prod build/preview), both builds exit 0.** OSS-525 canceled (stale-cache false report). **+** OSS-456 vite-qwik-router e2e at parity. OSS-498 rename → `qwik-ts-optimizer` In Progress until `npm publish`. Backlog: [OSS-512](https://linear.app/kunai/issue/OSS-512) (comment cleanup), OSS-448 (scope-aware import DCE), OSS-471, OSS-473, OSS-465 RCA follow-ups, OSS-439 (F3), OSS-450 Sub-D. Code-hygiene track D paused (OSS-489 stage-2). |
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

- **2026-07-15** — **PR #349 merged → `main` (`d5ab46c`); post-merge wrap-up complete.** OSS-529/530/534 all flipped to Done; OSS-533 was already Done. Three merged branches (`fix/oss-534-jsxdev-const-bag-partition`, `fix/oss-529-jsxsplit-partition`, `fix/raw-props-default-sibling-ref`) deleted local + remote; qds `dist` rebuilt + re-synced (`partitionSpreadProps` verified in the store copy). OPTIMIZER.md audit → no update (contract-preserving JSX partition fix). Baseline now 203/212 convergence, **1172/1197 full**. **NEXT: OSS-535 (select `_jsxDEV` key-gen) off fresh `main`, or OSS-531/532 interaction bugs.**
- **2026-07-15** — **Stranded-#348 recovery + bundled PR #349.** During post-merge wrap-up, found PR #348 (OSS-529/530) marked MERGED on GitHub but its code never reached `main`: #348 was stacked on #347's branch and merged into *that branch* while #347 reached `main` via a separate squash, stranding OSS-529/530 on `fix/raw-props-default-sibling-ref`. Recovered by rebasing `fix/oss-534-jsxdev-const-bag-partition` onto `main` (git auto-dropped the already-landed OSS-533 commit), leaving exactly OSS-529/530 + OSS-534 (4 src files); gate green (203/203 conv, 1160/1160 full, +12 new). Opened bundled **PR #349 → main** (Closes OSS-529, OSS-530, OSS-534). OSS-533 (#347, on `main`) flipped to Done. Stranded branches `fix/oss-529-jsxsplit-partition` + `fix/raw-props-default-sibling-ref` to be deleted once #349 merges. **NEXT: merge #349, then OSS-535 (select `_jsxDEV` key-gen) or the OSS-531/532 interaction bugs.**
- **2026-07-14** — [OSS-534](https://linear.app/kunai/issue/OSS-534) const-bag partition **LANDED** (`de2ddd7` on `fix/oss-534-jsxdev-const-bag-partition`, stacked on #348, not pushed). Ported the OSS-529 var/const-bag partition to the production `_jsxDEV` path (`buildJsxSortedCall`), faithful to SWC's rule (`is_const.rs` + `transform.rs`): before-spread props → var, after-spread → `is_const_expr`/reactive-const (component reactive always const via `is_fn`), spread `_getConstProps` → const bag unless non-final/var-follows (lone trailing renders bare), shorthand → var. select-root/popover-root/tabs-root byte-parity; corpus `_jsxSplit` divergence 133→28 files; gate green 203/9 + 1158, +14 tests. **KEY finding: the `/components/select/` `insertBefore` crash is NOT the partition gap** — select-root is byte-parity yet it persists (SWC clean, TS crashes, browser head-to-head). Root-caused to a separate `_jsxDEV` **key-generation** bug (nested components emit no key vs SWC's `is_fn||root` positional keys) → **[OSS-535](https://linear.app/kunai/issue/OSS-535) filed (Backlog)**. **NEXT: push/PR OSS-534 once #347/#348 clear, or pick up OSS-535.**
- **2026-07-10 late pm** — PR #348 extended ([OSS-529](https://linear.app/kunai/issue/OSS-529), In Review) — **the OSS-529 fix was INCOMPLETE**. A clean-cache re-sweep (build+rsync+`.vite`-clear) showed 7 routes still crashing `fn.apply`: the partition fix landed only in the raw-JSX path, but the bundler feeds pre-transformed `_jsxDEV` through `buildJsxSortedCall` (`jsx-call-transform.ts`), untouched. There a `$`-handler with a reactive ternary value (`onPointerEnter$: hover ? […] : …`) hoisted to `_fnSignal` → runtime dispatched the WrappedSignal as the handler. Fix: `wrapReactivePropValues` skips `$`-keys + `buildJsxSortedCall` routes `$`-key props to the var bag raw; folded in `bind:X={obj.field}` → `_wrapProp(obj,"field")` parity (`jsx-props.ts`). Browser-verified crash-free on all 7 routes vs pristine qwik-core; +4 tests; convergence 203/9, gate green. **[OSS-534](https://linear.app/kunai/issue/OSS-534) filed** for the residual: production `_jsxDEV` path still emits `null` const bags (partition unported) + `/components/select/` `insertBefore` crash (likely same gap). `modal` `[generateJsx]` confirmed docs-tooling at parity, not ours. **NEXT: OSS-534 — port the const-bag partition to `buildJsxSortedCall`.**
- **2026-07-10 pm** — PR #348 ([OSS-529](https://linear.app/kunai/issue/OSS-529) + [OSS-530](https://linear.app/kunai/issue/OSS-530), In Review, stacked on #347) — the DOMINANT `fn.apply is not a function` click crash on 10 routes FIXED. Root cause runtime-traced (settled the ticket's 3 conflicting opinions): patched qwik-core `invokeApply`/`runEventHandlerQRL` on disk → the dispatched "handler" is a `_fnSignal` WrappedSignal because reactive props sat in the VAR bag, shifting the runtime's positional handler resolution. Needed BOTH: (OSS-529) component single-spread `_jsxSplit` was merging all props into var with a `null` const bag → `partitionableComponentSpread` routes const props to the const bag (`jsx-elements-core.ts`); (OSS-530) `!signal.value` (UnaryExpression) never hoisted → added to the compound arm in `analyzeSignalExpression` (`signal-analysis.ts`). var bag now holds only event handlers, byte-matching SWC on popover-root. All 10 routes browser-verified 200 + crash-free; convergence 203/9, gate green, +5 tests. **NEXT: continue the interaction sweep on remaining widget routes** (OSS-531 sync$ leak + OSS-532 readOnly still open).
- **2026-07-10 pm** — PR #347 ([OSS-533](https://linear.app/kunai/issue/OSS-533), In Review) — SSR-blocking regression found while building the OSS-529 repro. Fresh-cache dev SSR hung on EVERY page: `prefetchProp is not defined` in `@qwik.dev/router`'s `Link`. Today's OSS-528 (PR #342) raw-props default consolidation inlined a destructure default referencing a SIBLING binding (`prefetchData = prefetchProp === "js" ? …`) into a `.w([...])` capture array → dangling `prefetchProp`. Fix: widened `collectPatternBindings`' unsafe-default gate from call-only to a faithful `is_const_expr` port (`defaultExprIsNonConst`: Call / Member / sibling-reference → abort). +2 tests; convergence 203/9, gate green; all routes SSR-render 200 again.
- **2026-07-10** — qds interaction-layer two-fleet close-out ([OSS-499](https://linear.app/kunai/issue/OSS-499), no PR — investigation + tracker filing). With full route-render parity done, ran two parallel agent fleets to surface interaction-only bugs. **First Fleet** (offline `scan-divergence.mjs` TS↔SWC codegen diff over 178 lib+widget files) → shipped [OSS-527](https://linear.app/kunai/issue/OSS-527) + [OSS-528](https://linear.app/kunai/issue/OSS-528). **Second Fleet** (`pw-probe.mjs` Playwright parallel headless-browser interaction over all 24 routes — the deterministic/parallel answer the single claude-in-chrome extension can't be) → filed the dominant [OSS-529](https://linear.app/kunai/issue/OSS-529) (`_jsxSplit` null-const-bag + raw props-proxy spread → `fn.apply is not a function` on click, ~10 routes; **root cause unresolved — 3 conflicting agent opinions, needs qwik-core runtime tracing**) plus Backlog [OSS-530](https://linear.app/kunai/issue/OSS-530) (negated-signal not hoisted), [OSS-531](https://linear.app/kunai/issue/OSS-531) (`sync$` TS-annotation leak, verified), [OSS-532](https://linear.app/kunai/issue/OSS-532) (Textbox `readOnly` no-effect, TS-specific, not root-caused). Both fleet tools persist in scratchpad for reuse. No code change — convergence 203/9, full 1158 unchanged.
- **2026-07-10** — PR #344 ([OSS-527](https://linear.app/kunai/issue/OSS-527), **Done**) merged to `main` (`84a21d1`). qds validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)): `_fnSignal` hoisting (`jsx/signal-analysis.ts`) over-hoisted a non-reactive `.map()` JSX child AND lifted the map callback param as a dep → `node`/`child is not defined` (sidebar). Fix: `collectSignalDeps` tracks nested arrow/function params (`boundParams`) and never collects them; a `containsNonOptionalCall` guard keeps a rootless `foo.map(...)` inline while optional-chain getters + `sig.value[key]` computed keys still hoist. Matches SWC (verified it also inlines method-call reactive exprs); convergence 203/9, full 1153→1158 (+5 tests). Both First-Fleet audit bugs now shipped (OSS-527 + OSS-528). A Playwright interaction fleet (parallel headless-browser probing of all 24 routes, deterministic pageerror capture) then found + runtime-PROVED **[OSS-529](https://linear.app/kunai/issue/OSS-529)** — the dominant interactive bug: `_jsxSplit` `null` const bag + raw props-proxy spreads on `Render`-based triggers → `fn.apply is not a function` on click across radio-group/popover/select/tabs/checkbox/collapsible/textbox (F9 family). Textbox `readOnly`-no-effect still open (separate reactivity bug).
- **2026-07-10** — PR #342 ([OSS-528](https://linear.app/kunai/issue/OSS-528), **Done**) merged to `main` (`17d0962`). qds validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)): the raw-props/`_restProps` consolidation dropped destructure DEFAULTS — the body-destructure path (`analyzeBodyDestructureDeclarator` in `rewrite/raw-props.ts`) hard-coded an empty defaults map (the param path already handled them). `const {selectOnFocus=true}=props` → TS emitted `props.selectOnFocus` vs SWC `props.selectOnFocus ?? true`, breaking default-valued props (tabs `selectOnFocus`, etc.). Fix collects+carries field defaults into the plan. Found by the corpus-wide TS-vs-SWC audit fleet; convergence 203/9, full 1152→1153 (+1 test). Sibling [OSS-527](https://linear.app/kunai/issue/OSS-527) (sidebar `_fnSignal` non-reactive `.map` over-hoist) fix in progress; a Playwright interaction fleet is probing all routes for more runtime bugs.
- **2026-07-10** — PR #340 ([OSS-526](https://linear.app/kunai/issue/OSS-526), **Done**) merged to `main` (`22f9684`). qds validation ([OSS-499](https://linear.app/kunai/issue/OSS-499)) FIRST per-widget interaction bug: Textbox `onChange$` toggle → `ReferenceError: handlerName is not defined`, page lock-up. Root cause: `_fnSignal` hoisting (`jsx/signal-analysis.ts`) dropped a store/signal chain’s computed-key dep — `collectSignalDeps` addRoot’d the signal then early-returned past the computed key, and `rootReplacementsCollector` skipSubtree’d it. `playground.tsx` `handlerCounts.value[handlerName]` (`.map` callback var) → `_hf0=(p0)=>p0.value[handlerName]` + `_fnSignal(_hf0,[handlerCounts])`, handlerName dangling. Fix (matches SWC `(p0,p1)=>p0.value[p1]` + `[handlerCounts,handlerName]`): walk+carry computed keys (loop-locals gated on localNames; module-scope keys stay free) + `collectComputedKeyRewrites` parameterizes them. Browser-verified; convergence 203/9, full 1150→1152 (+2 tests). Separate Textbox `readOnly`-no-effect symptom still open.

## What to do next

**[OSS-534](https://linear.app/kunai/issue/OSS-534) is DONE and merged** ([PR #349](https://github.com/thejackshelton/TS-Optimizer/pull/349), `d5ab46c` on `main`). Post-merge wrap-up complete (branches deleted, qds dist re-synced, tickets Done). The next feature is **[OSS-535](https://linear.app/kunai/issue/OSS-535)** (below) — now unblocked; branch it off fresh `main`.

**Next feature — [OSS-535](https://linear.app/kunai/issue/OSS-535) (Backlog):** the `/components/select/` `insertBefore` crash, root-caused to the `_jsxDEV` **key-generation** gap. In `buildJsxSortedCall` (`jsx-call-transform.ts`): (1) preserve the original key only for the 3-arg `jsx(type, props, key)` form, ignore the 6-arg `_jsxDEV` key/source args; (2) swap the `!isNested` key gate for `!isHtmlTag || !isNested` (component OR root), matching SWC's `should_emit_key = is_fn || root_jsx_mode` (`transform.rs:1189`); (3) optional dev-metadata 7th arg for byte-parity. **Regression surface** (why it's separate from OSS-534): touches every pre-transformed route, risks the passing `example_qwik_react` snapshot, must preserve SSR↔client key determinism. Verify: select crash-free head-to-head + `example_qwik_react` + full gate green.

**Session scratchpad tooling** (`/private/tmp/claude-501/-Users-scottweaver-Projects-TS-Optimizer/aadaab9c-.../scratchpad/`): `jsx-diff.mjs` (per-file jsxSplit/jsxSorted call differ), `corpus-jsxsplit.mjs` (corpus-wide `_jsxSplit` bag divergence scan), `one-file.mjs` (full untruncated jsx-call diff), plus copies of `norm-diff-lowered.mjs` / `pinpoint.mjs` / `sweep-all.mjs`. Offline lowered-input harness (esbuild `jsxDev` → `transformModule`, opts `{minify:'simplify',mode:'hmr',entryStrategy:'smart',isServer:false}`) reproduces `_jsxDEV`-path divergence without a browser. Browser verify: build + rsync dist into the qds pnpm store copy + `rm -rf docs/node_modules/.vite`, then two servers — `QDS_TS_OPTIMIZER=1 vite --mode ssr --port 5200` (TS) and plain `vite --mode ssr --port 5201` (SWC) — and `node sweep-all.mjs http://localhost:5200` (⚠️ the two servers share the docs dir; starting the 2nd can disrupt the 1st — verify both respond before sweeping).

**After OSS-534:** remaining interaction bugs — [OSS-531](https://linear.app/kunai/issue/OSS-531) (`sync$` TS-annotation leak, verified), [OSS-532](https://linear.app/kunai/issue/OSS-532) (Textbox `readOnly` no-effect, not root-caused). Merge PRs #347 → #348 (both touch `src/`, normal review) once ready — then the branches rebase/clean up post-merge.

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
