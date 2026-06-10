# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-06-10 (hygiene track B3b — [OSS-475](https://linear.app/kunai/issue/OSS-475) unify the four-site event-handler q:p param extraction onto `eventHandlerQpParams` — **merged, PR #245**; bare-`_` policy SWC-grounded, +9 tests, OPTIMIZER.md audit: no update needed). Code-hygiene track now: OSS-474/475/476/477/478/479/480 (PRs #232/#245/#234/#236/#238/#240/#242) **Done** — Tracks A, B1–B3, C closed; tracks B4/D/E open — roadmap in project memory. **Milestone still standing: `vite-qwik-router` is interactive end-to-end in dev under the TS optimizer** (counter + `server$` RPC at parity with SWC; OSS-470 PR #228 + OSS-472 PR #230). Convergence **203/9** unchanged; full suite **1013** (baseline auto-update absorbed PRs #244 + #245). Active workstream [OSS-456](https://linear.app/kunai/issue/OSS-456); parity backlog + RCA follow-ups (OSS-465) and the prod-preview `_run` Q14 (at parity with SWC, bundler/runtime) per the Branches/What-next sections below.

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
| Full suite passing (baseline) | **1013** |
| Last verified | 2026-06-10 on `main` (post PR #245; baseline auto-update absorbed) |

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
| `main` | `ab395ba` (PR #245) | ✅ | baseline | Active workstream: OSS-456 — vite-qwik-router **interactive e2e in dev** (counter + `server$` RPC) under `tsOptimizer`, at parity with SWC; OSS-470 + OSS-472 merged. Backlog: OSS-471 (app migration MOVE — parity, not Q14), OSS-473 (spa_init dev-path), OSS-465 RCA follow-ups; OSS-447 + OSS-448 (block `example_qwik_router_client` flip); OSS-439 (F3); OSS-450 Sub-D. Prod-preview `_run` Q14 at parity with SWC (bundler/runtime). Code-hygiene track: OSS-474/475/476/477/478/479/480 (PRs #232/#245/#234/#236/#238/#240/#242) merged — Tracks A, B1–B3, C closed; B4/D/E open. OSS-481 createOptimizer NAPI parity merged (PR #244). |
| `oxc-port` | `073a11d` | ✅ | n/a (Rust) | Long-lived Rust/OXC port. Subtree-imported `qwik-optimizer` as `oxc/`; oxc 0.129 / napi 3. 31/31 cargo tests passing. Not blocking TS work. |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster fully closed via OSS-403 siblings on `main` — safe to delete. |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343)) — closed

All 7 sub-issues Done. `generateAllSegmentModules` orchestrator at `src/optimizer/transform/segment-generation.ts` is now a 34-line sequencer over named helpers (down from 580 lines pre-refactor, ~94% reduction). Per-Sub scope in `.planning/specs/segment-generation-refactor.md`. See Linear [OSS-343](https://linear.app/kunai/issue/OSS-343) for rolled-up sub-issue history (OSS-344/345/346/347/356/357/358).

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
| F10 | PARTIAL (1/2) | Sub-A [OSS-437](https://linear.app/kunai/issue/OSS-437) Done; Sub-B (`example_qwik_router_client`) blocked by OSS-447 + OSS-448 |

Full feature analysis: `CONVERGENCE_FAILURES.md`.

## Most recent meaningful progress

Most recent first. **Each entry is a one-line pointer — drill into the PR, commit message, or Linear ticket for full detail.** Trim entries past ~10.

- **2026-06-10** — PR #245 ([OSS-475](https://linear.app/kunai/issue/OSS-475), Done, hygiene track B3b) merged to `main` (`ab395ba`). Unified the four-site event-handler q:p param extraction onto `eventHandlerQpParams`; bare-`_` policy resolved against SWC source (`event_handler_placeholder_pat` emits bare `_` only at slot 0; with the `_, _1` prefix a second bare `_` is a duplicate-param SyntaxError, so the divergent arm was unreachable) — standardized on the skip via `paddingParam`, deleted `numberedPaddingParam`. +7 helper unit tests, +2 mutation-verified pre-padded-input e2e tests. Convergence 203/9; baseline clean; OPTIMIZER.md audit: no update needed (no cited symbols; drift ≤11 lines). Track B now closed except B4; remaining hygiene tracks: B4, D, E.
- **2026-06-10** — PR #244 ([OSS-481](https://linear.app/kunai/issue/OSS-481), Done) merged to `main` (`29c65ee`). `createOptimizer` is now a true SWC NAPI drop-in: raw-string `Napi*` option types at the boundary (branded internally via the smart constructors), output mapped to SWC's `segment`/`origPath` null-arm record shape with mutable arrays; `NapiSegmentAnalysis.ctxKind` follows runtime truth incl. `'jSXProp'` (SWC's published d.ts is stale). qwik-bundler's `tsOptimizer` adapter thinned to a dynamic import — no branding/mapping downstream. +2 tests (NAPI-surface round-trip + `program` pass-through regression guard); convergence 203/9 unchanged; full suite 1004. Advances [OSS-450](https://linear.app/kunai/issue/OSS-450) (bundler integration).
- **2026-06-10** — PR #242 ([OSS-480](https://linear.app/kunai/issue/OSS-480), Done, hygiene track C3 — Track C closed) merged to `main` (`8de8529`). Decomposed the ~270-line / 5–6-deep `promoteEventHandlerCaptures` into a ~60-line flat sequencer over five named helpers; unified the duplicated while/do-while counter scan (`collectWhileLoopCounterCandidates` — `declMustPrecedeLoop` names the sites' only delta) and the copy-pasted `unifyParameterSlots`/`buildElementCaptureMap` machinery into shared grouping helpers + `sortQpNamesForGroup` (the SWC Rule 7 q:p ordering policy, previously stated ×3). Test-neutral (203/9, full 1002); OPTIMIZER.md audit: no update needed (module not cited). Foundation for OSS-475 (B3b) + hygiene B4. Remaining hygiene tracks: B4, D, E.
- **2026-06-09** — PR #240 ([OSS-479](https://linear.app/kunai/issue/OSS-479), Done, hygiene track C2) merged to `main` (`2186deb`). Consolidated the four ~40-field `ExtractedSegmentBuilder` literals in `extractSegments` (marker-call/inlinedQrl/JSX-attr/JSX-object-prop paths) into one `buildExtractedSegment` factory owning all shared defaults + derivations; `hashFromSymbolName` (3 copies) + `classifyJsxHandlerCtxKind` (2 copies) helpers; the marker-call path's deliberately-different classifier documented, not unified. Next `ExtractionBase` field is a 1-site change (foundation for OSS-466 + B4). Test-neutral (203/9, full 1002); OPTIMIZER.md: 18 extract.ts refs resynced incl. pre-existing >50-line drift. Remaining hygiene tracks: B4, C3, D, E.
- **2026-06-09** — PR #238 ([OSS-478](https://linear.app/kunai/issue/OSS-478), Done, hygiene track C1) merged to `main` (`9a87800`). Split the ~657-line `transformModule` into a thin multi-file loop + `transformOneModule` per-file driver + nine named phase helpers, each with an explicit typed result (`PreparedModuleInput`/`CaptureAnalysis`/`MigrationAnalysis`/…) — the OSS-343 segment-generation playbook applied one level up. Order-sensitive `isJsx` accumulator + diagnostics ordering preserved deliberately; entry-strategy derivation deduplicated into `resolveEmitConfig`. Test-neutral (203/9, full 1002); OPTIMIZER.md phase table rewritten to helper anchors + 9 line refs resynced in-PR. Foundation for OSS-467 coupling audit + hygiene C3/D2. Remaining hygiene tracks: B4, C2/C3, D, E.
- **2026-06-09** — PR #236 ([OSS-477](https://linear.app/kunai/issue/OSS-477), Done, hygiene track A) merged to `main` (`30bc45b`). Comments-only sweep: eight sites across seven files where comments carried history narratives, PR refs, or what-not-why restatements, trimmed to present-tense invariants — all SWC-reference anchors kept; the genuine compatibility-why at `create-optimizer.ts:86` deliberately preserved. Zero code changes; test-neutral (203/9, full 1002); typecheck + `ci:baseline:check` clean. OPTIMIZER.md audit: no update needed (comments-only; no cited file:line refs shifted). Remaining hygiene tracks: B4, C1/C2/C3, D, E.
- **2026-06-09** — PR #234 ([OSS-476](https://linear.app/kunai/issue/OSS-476), Done, hygiene track B1) merged to `main` (`1fa42db`). Consolidated JSX attribute-name extraction into one canonical `getJsxAttributeName` (`utils/jsx-attr-name.ts`, total over `JSXIdentifier | JSXNamespacedName` with exhaustive `never` dispatch); replaced 2 divergent local helpers + 7 inline reimplementations across `extract.ts`/`segment-codegen.ts`/`rewrite/index.ts`/`jsx-props.ts`/`diagnostic-detection.ts`, deleted the `PassiveDirectiveAttribute` duck-type, tightened `collectPassiveDirectives` to `readonly JSXAttributeItem[]`. Test-neutral (203/9, full 1002); net −32 LOC. OPTIMIZER.md audit: no update needed (type-internal; line drift <50). Next hygiene tracks: A (comments), B4 (now builds on this helper), C1/C2/C3, D, E.
- **2026-06-09** — PR #232 ([OSS-474](https://linear.app/kunai/issue/OSS-474), Done) merged to `main` (`f2b322c`). Code-hygiene track opened: five test-neutral helper consolidations — `buildParentFieldMap`/`buildSegmentMetadata`/`tryConsolidateRawProps` (segment-generation.ts), new `utils/event-attrs.ts` (one source of truth for the drifted `q-*:` event prefixes) + `utils/w-call.ts` (`.w([captures])` emit). Convergence 203/9, full 1002 unchanged. Deferred B3b (4-site q:p param-extraction, inconsistent bare-`_` policy) → [OSS-475](https://linear.app/kunai/issue/OSS-475) (Backlog). 5-track audit roadmap in project memory; OPTIMIZER.md segment-generation line-refs resynced in this wrap-up.
- **2026-06-09** — PR #230 ([OSS-472](https://linear.app/kunai/issue/OSS-472), Done, sub of OSS-456) merged to `main` (`5fbeb3a`). **The real `server$` Q14 fix**: TS was stripping `inlinedQrl` segments; SWC never does (its strip gate `should_emit_segment` applies only to the developer-`$()` path, never `create_synthetic_qqsegment`). The router lib's `serverQrl` dispatcher (`inlinedQrl(…, "serverQrl_w03grD0Ag68", …)`) matched the client `stripCtxName: [server]` via `startsWith` → collapsed to a chunkless `_noopQrl` → Q14. Centralized the per-extraction strip decision as `isStrippedExtraction` (`!ext.isInlinedQrl`) across ~13 call sites. **Verified on the real dev build (Playwright): "Test server" fires the RPC (POST 200), counter works, Q14 gone — at parity with SWC.** +1 non-vacuous regression test; full suite 1002 (was 1001); convergence 203/9. **Disproved** the prior session's "migration MOVE-vs-REEXPORT" Q14 hypothesis (OSS-471 shelved → Backlog). Prod-preview `_run` Q14 confirmed at parity with SWC; latent `spa_init` dev-path filed as OSS-473.
- **2026-06-09** — PR #228 ([OSS-470](https://linear.app/kunai/issue/OSS-470), Done, sub of OSS-456) merged to `main` (`79587dd`); branch deleted, ticket flipped. Deep-dive on the remaining `server$` Q14 (next workstream): root-caused to (1) **capture over-attribution** — the component segment wrongly captures the module-level `testServer$` that is referenced only inside its nested `onClick$` handler (SWC never captures module scope: `fold_module` pushes no `decl_stack` frame), inflating `segmentUsage` to two consumers → MIG-02 reexport instead of MIG-01 move; and (2) a **broken MOVE execution** for `$`-named marker-QRL decls (`tryBuildMarkerDeclMove` displayName mismatch on the unescaped `$`, plus no strip-aware `_noopQrl` emission). Validated capture fix is convergence-neutral. New ticket + branch off `main`.
## What to do next

**Two candidate workstreams.** Pick based on appetite — parity progress vs integration milestone.

### Candidate A — Parity continuation (OSS-447 + OSS-448, blocks OSS-446)

OSS-446 (In Progress; parent of OSS-447 + OSS-448). Convergence at **203/212 (95.8%)** — 9 failing. OSS-446's three documented bugs landed via PR #190. The convergence flip on `example_qwik_router_client` is gated on two follow-up sub-issues filed mid-impl per `feedback_parity_audit_multi_root_cause`:

- **[OSS-447](https://linear.app/kunai/issue/OSS-447)** — migration policy for non-marker module-level helpers consumed by exactly one segment (`useQwikMockRouter` case). New arm in `decideMigration` + orphan-QRL-binding-drop pass.
- **[OSS-448](https://linear.app/kunai/issue/OSS-448)** — scope-aware import DCE in `filterUnusedImports`. Replace the regex-based identifier test with a scope-aware AST walk; can reuse OSS-446 Bug 3's `buildClosureLexicalScopes` infrastructure.

Both required to flip the fixture. After they land, OSS-446 closes on its original acceptance.

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

- Broader `simplify` coverage beyond `utils/simplify.ts`'s current scope.
- Perf follow-ups: BENCH-01 at 2.66× (cap 1.15×); BENCH-02 at 4.67× (cap 1.5×). File a Linear ticket per workstream; append `BENCHMARKS.md` row before/after.
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
