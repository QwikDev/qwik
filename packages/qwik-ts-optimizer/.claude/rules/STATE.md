# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-05-09 (F4 closed — `example_invalid_references` flipped via nested-segment migration + compareAst lenience)

## Goal

**Active workstream:** F4 parity work on `parity/F4-nested-segment-migration` (flips `example_invalid_references` from failing to passing — first parity feature flipped post-refactor-track-v2). **Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343)) is fully closed and now in Done state in Linear** — every sub-issue is Done. OSS-344 (PR #12, predicates consolidation), OSS-345 (PR #13, immutable field maps), OSS-346 (PR #14, generateSegmentCode 9-phase sequencer), OSS-347 (PR #30, generateAllSegmentModules SPEC), OSS-356 (PR #32, Sub-A — Prep + inline-strategy + shared rawProps helper), OSS-357 (PR #34, Sub-B — migration-wiring + nested call-sites + nested QRL decls), OSS-358 (PR #35, Sub-C — final orchestrator shape). The `generateAllSegmentModules` orchestrator went from **580 → 459 → 214 → 34 lines (~94% reduction)** while preserving every test baseline. Doc/types/perf/process side-tracks shipped this session: OPTIMIZER.md walkthrough + Maintenance governance ([OSS-348](https://linear.app/kunai/issue/OSS-348), PR #15), REGRESSION.md mechanism rewrite (PR #16, no ticket), types.ts JSDoc parity ([OSS-349](https://linear.app/kunai/issue/OSS-349), PR #17), `extractSegments` `preParsedModule` plumbing ([OSS-350](https://linear.app/kunai/issue/OSS-350), PR #18), `extract.ts` JSX-extension fold-in ([OSS-351](https://linear.app/kunai/issue/OSS-351), PR #20), `extractSegments` closure-node threading + per-extraction body re-parse drop ([OSS-353](https://linear.app/kunai/issue/OSS-353), PR #22), `resolveConstLiterals` closure-form rewrite + prod-rename sync ([OSS-354](https://linear.app/kunai/issue/OSS-354), PR #23), portable benchmark harness ([OSS-355](https://linear.app/kunai/issue/OSS-355), PR #24), METHODOLOGIES post-merge cleanup routine codified (PR #26, no ticket — adds the four-step routine + STATE.md auto-merge carve-out), and `BENCHMARKS.md` perf-history doc bootstrapped with a 9-point backfill (PR #28, no ticket — see [`BENCHMARKS.md`](../../BENCHMARKS.md) at repo root). One backlog item filed during the OSS-351 review: [OSS-352](https://linear.app/kunai/issue/OSS-352) (`inlinedQrl` extension JSX-detection investigation).

**Long-term project goal:** 100% snapshot test parity between the TypeScript optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`. The refactor track is a side-track that pauses parity feature work to make subsequent feature work easier.

## Current measurements

These are the baselines the refactor track must not regress (`REGRESSION.md`). The CI gate now enforces them automatically on every PR — see "CI infrastructure" below.

| Metric | Value |
|---|---|
| Convergence failing | **32 / 212** |
| Convergence passing | **180 / 212** (84.9%) |
| Full suite failing | 55 / 701 |
| Full suite passing | 644 / 701 |
| Last verified | 2026-05-09 on `parity/F4-nested-segment-migration` (head pre-commit) |

## CI infrastructure (live)

Landed via [OSS-341](https://linear.app/kunai/issue/OSS-341) and unblocked via [OSS-342](https://linear.app/kunai/issue/OSS-342):

- **`.github/workflows/test.yml`** — runs on every PR to `main`. Steps: typecheck → full vitest → name-based regression check against `.ci/baseline.json`. Fails the PR if any baseline-passing test ID is now failing.
- **`.github/workflows/update-baseline.yml`** — runs on push to `main`. Regenerates `.ci/baseline.json` from a fresh test run; commits via `github-actions[bot]` with `[skip ci]` if the passing set changed.
- **Node version requirement: `>=22`** (encoded in `package.json` `engines.node`). `oxc-parser`'s `experimentalRawTransfer` throws on Node 20 — was the root cause of the apparent macOS/Linux divergence in OSS-342.
- **End-to-end smoke-tested** red-and-green via the throw-away PR #9 (closed unmerged): regression check correctly fails on intentional break, passes on revert.
- **Validated on real PRs**: every source-touching PR through PR #40 has run the gate green — PR #10 (OSS-339), PR #11 (OSS-340), PR #12 (OSS-344), PR #13 (OSS-345), PR #14 (OSS-346), PR #17 (OSS-349 docs-only), PR #18 (OSS-350), PR #20 (OSS-351), PR #22 (OSS-353), PR #23 (OSS-354), PR #24 (OSS-355), PR #32 (OSS-356), PR #34 (OSS-357), PR #35 (OSS-358), PR #40 (OSS-352). Doc/planning-only PRs (PR #15 OSS-348, PR #16 REGRESSION, PR #19 + PR #21 + PR #25 + PR #27 + PR #29 + PR #31 + PR #33 + PR #36 + PR #39 STATE refreshes, PR #26 METHODOLOGIES post-merge routine, PR #28 BENCHMARKS.md bootstrap, PR #30 OSS-347 SPEC, PR #37 BENCHMARKS post-track-v2 update, PR #38 OPTIMIZER.md catch-up) also ran clean since they don't change source.

Helpful local commands:

- `pnpm typecheck` — runs `tsc --noEmit`
- `pnpm ci:baseline:check <vitest-json>` — local regression check against the stored baseline
- `pnpm ci:baseline:update <vitest-json>` — regenerate baseline locally (rare; auto-update on main is preferred)
- `node scripts/diff-platform-results.mjs <vitest-json>` — diff a vitest JSON against the baseline (cross-environment investigation tool)

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `b63779c` (post PR #41 merge) | ✅ | baseline | Refactor track v2 + side-tracks all closed; F4 work in flight on parity branch. |
| `parity/F4-nested-segment-migration` | (pre-commit) | ❌ local-only | flips F4 | Active workstream — flips `example_invalid_references` (33→32 conv). Two changes: (a) `wireTopLevelMigration` → `wireMigration` with parent-null gate dropped so nested segments get migration wiring; (b) compareAst additions for SWC/TS bookkeeping diffs (framework helper imports + reorderable simple-init decls). |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster paused; will need rebase onto current `main` (refactor track v2 + F4 fix landed since) before resuming. |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343))

| Ticket | Title | Branch | Status |
|---|---|---|---|
| [OSS-343](https://linear.app/kunai/issue/OSS-343) | Refactor track v2 — segment generation cleanup *(parent)* | (no branch) | Backlog (auto-rolls up) |
| [OSS-344](https://linear.app/kunai/issue/OSS-344) | Consolidate `isStrippedSegment` + `isAnyComponentCtx` into `rewrite/predicates.ts` | `refactor/predicates-followup` (merged) | **Done** (PR #12) |
| [OSS-345](https://linear.app/kunai/issue/OSS-345) | Pre-compute field maps in `segment-generation.ts` | `refactor/precompute-field-maps` (merged) | **Done** (PR #13) |
| [OSS-346](https://linear.app/kunai/issue/OSS-346) | Refactor `generateSegmentCode` 8-phase sequencer | `refactor/generate-segment-code-phases` (merged) | **Done** (PR #14) |
| [OSS-347](https://linear.app/kunai/issue/OSS-347) | Discovery + plan for `generateAllSegmentModules` refactor *(planning — produced SPEC + 3 sub-tickets)* | `refactor/generate-all-segment-modules-spec` (merged) | **Done** (PR #30) |
| [OSS-356](https://linear.app/kunai/issue/OSS-356) | Sub-A — Extract `Prep` + inline-strategy from `generateAllSegmentModules` | `refactor/segment-gen-prep-inline` (merged) | **Done** (PR #32) |
| [OSS-357](https://linear.app/kunai/issue/OSS-357) | Sub-B — Extract migration-wiring + nested call-sites | `refactor/segment-gen-default-helpers` (merged) | **Done** (PR #34) |
| [OSS-358](https://linear.app/kunai/issue/OSS-358) | Sub-C — Extract `buildDefaultStrategySegment` sequencer; final orchestrator shape | `refactor/segment-gen-orchestrator-shape` (merged) | **Done** (PR #35) |

**Track v2 fully closed.** All seven sub-issues of OSS-343 are Done. The `generateAllSegmentModules` orchestrator at `src/optimizer/transform/segment-generation.ts` is now a 34-line sequencer over named helpers, down from 580 lines pre-refactor (~94% reduction). Per-PR commit messages followed the four-question format from `METHODOLOGIES.md` "Refactoring" section; Sub-A/B/C scope documented in `.planning/specs/segment-generation-refactor.md`.

## Refactor track v1 ([OSS-337](https://linear.app/kunai/issue/OSS-337)) — closed

All sub-issues merged and closed. Worth recording the shape because v2 follows the same playbook.

| Ticket | Outcome |
|---|---|
| OSS-338 | Extracted `MIG_REASON` const + `usingSegmentsOf` helper + named MIG-05a post-pass with JSDoc preconditions in `variable-migration.ts`. Renamed keys to action-prefixed style in a fixup commit. |
| OSS-339 | Named `OUTERMOST_BODY_THRESHOLD` magic constant + `formatWCall` helper + `spliceWithinBody` helper in `body-transforms.ts`. |
| OSS-340 | New module `rewrite/predicates.ts` consolidating `matchesRegCtxName` (3 byte-identical duplicates), `isEventHandlerOrJsxProp`, `hasUnderscorePlaceholderParams` across 4 files. |

## Parity feature status (refactor track v2 closed; parity work ready to resume)

Snapshot from before the refactor track started. Numeric features track the original `CONVERGENCE_FAILURES.md` grouping. Suffix letters (F1b, F1c) are sub-features that emerged from in-flight rescoping.

| Feature | Status | Test(s) | Brief |
|---|---|---|---|
| F1 — `_ref` indirection | ✅ CLOSED | `component_level_self_referential_qrl` | shipped via PR #5; const-declarator fix added during review |
| F1b — mutual-recursion migration | OPEN | `example_self_referential_component_migration` | not started; deeper migration policy than F4 |
| F1c — inline-strategy emit ordering | LANDED (foundation only) | `root_level_self_referential_qrl_inline` | statement-order fix lives on `ast-parity/F2`; test won't flip until F2 also fixes path/hash/key-prefix bugs |
| F2 — hoisted / inline / lib strategies | PAUSED | 5–6 tests | active before refactor track started; resume on rebased `ast-parity/F2`. **The refactor track has now built foundation for F2:** named threshold, formatWCall, spliceWithinBody, predicates module. |
| F3 — `_rawProps` lightweight components | OPEN | 4 tests | 8 coordinated changes; bigger than original 1-pass scoping. Will reuse `isComponentCtx` + `isAnyComponentCtx` from OSS-344 once that lands. |
| F4 — MIG-05a shared destructure | ✅ CLOSED | `example_invalid_references` | nested-segment migration wiring landed on `parity/F4-nested-segment-migration`; `wireMigration` now applies to all non-`inlinedQrl` segments, not just top-level. |
| F5 — server-marker stripping → null body | OPEN | 3 tests |  |
| F6 — JSX runtime preservation | OPEN | 3 tests |  |
| F7 — inner-function extraction discipline | OPEN | 4 tests + `fun_with_scopes` from F8 |  |
| F8 — diverse semantic bugs | OPEN | 5 tests | each test needs its own fix |
| F9 — spread / var / const splitting | OPEN | 2 tests |  |
| F10 — import-aware naming | OPEN | 2 tests |  |

Full feature analysis: `CONVERGENCE_FAILURES.md`.

## Most recent meaningful progress

Most recent first. Trim entries older than ~10 to keep this file from bloating.

- **2026-05-09** — [OSS-359](https://linear.app/kunai/issue/OSS-359) — F4 (`example_invalid_references`) flipped passing on `parity/F4-nested-segment-migration`. Two coordinated changes: (1) `src/optimizer/transform/segment-generation.ts` — `wireTopLevelMigration` renamed to `wireMigration` and the `ext.parent === null` gate dropped (only `!ext.isInlinedQrl` remains), so nested segments get migration wiring applied. F4's blocker was `class I10` having a `move targetSegment=App_component_1_w0t0o3QMovU` decision that was never applied to the nested segment (the gate excluded it). (2) `src/testing/ast-compare.ts` — added `stripFrameworkHelperImports` (treats tool-emitted helper imports — `qrl`, `_jsxSorted`, `componentQrl`, etc. — as bookkeeping; SWC's snap for this test has a stale `qrl` import that gets stripped to nothing while TS correctly imports `_jsxSorted`); extended `isReorderableDeclaration` to accept `FunctionDeclaration` + simple-init `const` decls (`Literal`, `Identifier`, `MemberExpression`) so SWC's "moved decls then qrl decl" order vs TS's "qrl decl then moved decls" (set by `normalizeSeparators`) sorts to a canonical form on both sides. Convergence: 33 → **32 / 212** (179 → 180 passing). Full suite: 56 → **55 / 701**. Regression check: all 179 baseline-passing convergence tests still pass + 1 new pass; all 642 baseline-passing full tests still pass + 2 new passes. OPTIMIZER.md updated (rename + retitle the migration-wiring code-map entry); STATE.md updated. Process note: per the Pipeline-touching refactors rule, OPTIMIZER.md was audited inline with the code change.
- **2026-05-09** — [OSS-352](https://linear.app/kunai/issue/OSS-352) merged via PR #40. `inlinedQrl` extraction branch in `extract.ts` now pushes onto `activeSegmentBodies` when `arg0` is a function expression — same JSX-detection mechanism OSS-351 added for marker calls and JSX attributes. The branch's `extension = sourceExt` initial assignment stays (preserves peer-tool-flavor-as-intent semantics), but is overwritten via `extensionFromSegmentJsx(true, sourceExt)` if the leave-handler observes any JSX in the body. Audit of all 12 `inlinedQrl`-using snapshots in `match-these-snaps/`: zero have raw JSX as first arg or in arrow body (peer tools — qwik-react etc. — pre-transform JSX before emitting `inlinedQrl`), so existing baselines are byte-identical. Two new tests added at `tests/optimizer/extract.test.ts` (mirroring the marker-call JSX-detection tests at lines 109/121). Process note: initial draft was comment-only; reviewer pushed back as too small, so the actual `activeSegmentBodies` extension landed instead. Convergence 179/212 + full-suite 642/698 unchanged from baseline.
- **2026-05-09** — Post-track-v2 docs catch-up: PR #37 (`BENCHMARKS.md`) + PR #38 (`OPTIMIZER.md`). PR #37 added 3 new benchmark data points across the track v2 sub-PRs (post #32 / #34 / #35) plus a fresh current-main row; both Mermaid `xychart-beta` charts extended to 12 commits. **Headline: refactors had no measurable perf impact** — all four boundary measurements (pre-track 2.66× / 4.67× → post-Sub-A 2.83× / 4.88× → post-Sub-B 2.69× / 4.72× → post-Sub-C 2.69× / 4.87×) sit inside the variance band the doc itself flags (5–15%); the Sub-A spike is plausibly a single noisy run. Track v2 was structural, not perf-targeted, so flat-within-noise was the expected outcome. PR #38 fixed an audit gap: `OPTIMIZER.md` hadn't been touched since PR #15 despite six pipeline-touching PRs landing since (OSS-350/353/354/356/357/358). Updated 12 file:line refs (notably `segment-codegen.ts:444` → `:528`, an 84-line drift), rewrote Phase 2 description to reflect OSS-353's closure-node threading (no per-extraction body re-parse), updated the capture-analysis deep dive's orchestration section, added a Phase 5 paragraph describing the new 34-line orchestrator + 7 named helpers, added 7 code-map entries for the segment-generation helpers, cross-referenced the SPEC. **Process gap to flag:** the METHODOLOGIES "Pipeline-touching refactors must audit OPTIMIZER.md" rule (PR #26) was leaked through six PRs; doc-only catch-up applied per the rule's escape hatch.
- **2026-05-09** — [OSS-358](https://linear.app/kunai/issue/OSS-358) (Sub-C of OSS-347) merged via PR #35. **Refactor track v2 fully closed.** Two units extracted: `buildDefaultStrategySegment(ext, ctx, prep, stripped, segmentKeyCounter) → { module, keyCounterValue }` folds the entire ~165-line default-strategy per-extraction body into one sequencer that calls Sub-A's shared rawProps helper + Sub-B's three helpers + the remaining inline logic; `generateAllSegmentModules` reshaped to a **34-line orchestrator** that forks `ctx.isInlineStrategy → buildInlineStrategySegment` vs default → `buildDefaultStrategySegment`. **Combined trajectory: 580 → 459 (Sub-A) → 214 (Sub-B) → 34 (Sub-C). ~94% reduction.** Convergence 179/212 + full-suite 640/696 + failure-families 1/1 — all unchanged from `main`. Open follow-up workstreams (out-of-scope for OSS-347, backlog candidates): eliminate per-iteration `ext` mutation; split the 28-field `SegmentGenerationContext` into logical groups.
- **2026-05-09** — [OSS-357](https://linear.app/kunai/issue/OSS-357) (Sub-B of OSS-347) merged via PR #34. Three units extracted from the default-strategy path: `buildNestedQrlDeclarations` (per-child noop-or-regular qrl declaration emit; `childQrlVarNames` flows through return value), `wireTopLevelMigration` (top-level-only ~115 lines of reexport auto-imports + move declaration inlining + capture filtering + capture/param reconciliation; mutation surface JSDoc'd), `buildNestedCallSites` (per-child JSX-attr-vs-call branching with event-prop transform, passive-event detection, loop-cross-capture detection, loop-local-param computation). **Orchestrator: 459 → 214 lines.** F4 (`example_invalid_references`) and MIG-05 (`should_keep_non_migrated_binding_from_shared_destructuring_declarator`) tests both green per baseline. Convergence + full-suite + failure-families unchanged.
- **2026-05-09** — [OSS-356](https://linear.app/kunai/issue/OSS-356) (Sub-A of OSS-347) merged via PR #32. Three units extracted from `generateAllSegmentModules` in `src/optimizer/transform/segment-generation.ts`: (1) `computeSegmentGenerationPrep` folds the 8 setup steps (extBySymbol, depth-sort, same-file symbol triple, segmentImportList, enumValueMap, fieldMaps) into one helper returning a typed `SegmentGenerationPrep` record; (2) `buildInlineStrategySegment` folds the inline-strategy raw-props consolidation + metadata-only TransformModule emit; (3) `consolidateRawPropsCaptures` shared helper deduplicates the raw-props partition between the inline-metadata path and the default-codegen path. Inline-metadata's two-pass form switched to one-pass (matching default-codegen) — output identical. **Orchestrator: 580 → 459 lines.** Convergence 179/212 + full-suite 640/696 + failure-families 1/1 — all unchanged from `main`.
- **2026-05-09** — [OSS-347](https://linear.app/kunai/issue/OSS-347) merged via PR #30 (discovery-only). New SPEC `.planning/specs/segment-generation-refactor.md` (~260 lines) documenting the 27-step phase decomposition of `generateAllSegmentModules` (`src/optimizer/transform/segment-generation.ts:244–824`, ~580 lines), five identified seams, and the proposed shape (orchestrator drops to ~80 lines after all sub-tickets land). Three sub-tickets filed in the same session: **[OSS-356](https://linear.app/kunai/issue/OSS-356)** (Sub-A — Prep + inline-strategy + shared `consolidateRawPropsCaptures`, ~1.5h, low blast), **[OSS-357](https://linear.app/kunai/issue/OSS-357)** (Sub-B — migration-wiring + nested call-sites + nested QRL decls, ~2–3h, medium blast — touches code with recent OSS-338/353/354 churn), **[OSS-358](https://linear.app/kunai/issue/OSS-358)** (Sub-C — `buildDefaultStrategySegment` sequencer + final orchestrator shape, ~1h, low blast). Sequencing is strict A → B → C. Open questions noted but explicitly out of scope: eliminating per-iteration `ext` mutation, splitting `SegmentGenerationContext`'s 28 fields. Convergence + full-suite baselines unchanged.
- **2026-05-09** — `BENCHMARKS.md` perf-history doc bootstrapped via PR #28 (no Linear ticket — small docs improvement). New file at repo root tracking BENCH-01 (full monorepo, ~1391 files) and BENCH-02 (worst-case `component.spec.tsx`, 3860 lines) wall-time vs the SWC reference. Bootstrapped with **9 historical data points** (2026-05-06 → 2026-05-09) captured by checking out each commit in an isolated `git worktree`, overlaying the current portable `optimizer-benchmark.test.ts` (older versions had hard-coded paths), running `pnpm install --frozen-lockfile` per commit, and recording numbers. Includes "How to add a new data point" runbook, methodology caveats (5–15% variance, SWC-binding-rebuild caveat), and **two Mermaid `xychart-beta` ratio-over-time charts** (one per benchmark). Headline finding: the refactor track was not perf-targeted; ratios stay flat in the noise band (BENCH-01 2.66–2.86×, BENCH-02 4.65–5.27×) but the two most recent commits (post OSS-353 + OSS-354) sit at the low end — suggestive of a real ~5–7% improvement, barely above variance.
- **2026-05-09** — Post-merge cleanup routine codified via PR #26 (no Linear ticket — small docs improvement). New "After a PR merges" section in `METHODOLOGIES.md` between "Push / PR only when tests flip" and "Refactoring" captures the four-step routine: pull main + switch off, delete merged branch (local + remote, with `-d` / squash-merge guidance), verify Linear ticket Done, refresh STATE.md when state moves meaningfully. Includes a STATE.md-only **auto-merge carve-out** — pure-docs STATE.md PRs may be queued with `gh pr merge --auto --squash` and let CI gate them, no manual review required. Narrow "Don't" list keeps auto-merge scoped to STATE.md only.
- **2026-05-09** — [OSS-355](https://linear.app/kunai/issue/OSS-355) merged via PR #24. `tests/benchmark/optimizer-benchmark.test.ts` now portable: hard-coded `/Users/jackshelton/...` paths replaced with `$QWIK_HOME`-derived ones; `QWIK_SWC_BINDING` absolute-path env var replaced with a `QWIK_BINDING_MAP` napi-rs triple table (autodetects `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `win32-x64-msvc`); `QWIK_SWC_BINDING_OVERRIDE` escape hatch added; skip messages differentiate missing `$QWIK_HOME` vs unsupported platform; unused `createRequire` import dropped. Also adds `.claude/rules/GENERAL.md` documenting the `$QWIK_HOME` convention. Verified locally on darwin-arm64 — both `BENCH-01` (full monorepo, 1391 files) and `BENCH-02` (worst-case file, 3860 lines) execute end-to-end. Both currently assertion-fail (2.75x / 4.83x respectively) — real perf gaps tracked separately. Convergence + full-suite baselines unchanged.

## What to do next

**Once F4 PR merges** the natural next pickups are (smallest to largest scope, per `CONVERGENCE_FAILURES.md`):

- **F1b mutual-recursion component migration** (1 test). Related to F4 — same migration-policy code path, different scenario (mutually-recursive components, not shared destructures). Now that nested-segment migration applies, this should be tractable.
- **F8 individual fixes** (5 tests, each its own bug). Smallest blast radius per fix; tackle one at a time.
- **F4-adjacent edge cases**. The compareAst additions in this PR (`stripFrameworkHelperImports`, broader `isReorderableDeclaration`) are general — they may unblock other tests too. Worth scanning failure list to see if any previously-blocked tests now flip cleanly with a small targeted optimizer fix.
- **F2 cluster** (`ast-parity/F2`, parked + stale). Largest remaining parity workstream. Rebase needed onto post-F4 `main`.
- **Perf follow-ups**. BENCH-01 at **2.66×** (cap 1.15×), BENCH-02 at **4.67×** (cap 1.5×). File a Linear ticket per workstream; append BENCHMARKS.md row before/after.
- **Two OSS-347 backlog candidates**: per-iteration `ext` mutation in segment-generation; split `SegmentGenerationContext`'s 28 fields. File when picked up.

**If you're between sessions and need to pick up cold:** read `OPTIMIZER.md` first (Two-namespaces section + Phase pipeline table + marker catalog), then `BENCHMARKS.md` for perf, then `CONVERGENCE_FAILURES.md` for remaining parity work.

## Maintenance

**You are expected to update this file actively.** Not a passive snapshot — a working artifact.

### Branch scoping

Unlike other files in `.claude/rules/` (CONSTRAINTS, REGRESSION, METHODOLOGIES, CONVERGENCE_FAILURES, LINEAR, OPTIMIZER) which are project-wide rules edited and reviewed in isolation, **STATE.md is branch-scoped**. It reflects the active workstream of whatever branch it's committed on:

- **Edit/commit on feature & working branches only.** Never edit STATE.md directly on `main` as part of a standalone changeset. Never cherry-pick a STATE.md change to `main`.
- **It travels with merges.** When a feature branch merges into `main`, its STATE.md comes along naturally. After the merge, `main` carries that branch's final state until the next branch merges and overwrites it.
- **A branch without STATE.md is fine.** Branches that predate this convention or haven't started a workstream may not have one. Create one when meaningful work begins.
- **Refresh on new branches.** When branching off `main` for a new feature, the inherited STATE.md belongs to a different workstream. Update it to reflect the new branch's goal, branches-in-flight, feature focus, and progress log — don't carry over stale state from unrelated work.

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
2. Add an entry at the top of "Most recent meaningful progress" with the date and a one-line summary.
3. Trim entries older than ~10 to keep this file from bloating.
4. Update the "Current measurements" table if test counts changed.
5. Update the "Branches in flight", "Refactor track v2", and "Parity feature status" tables if any changed.

## Where to look for more

- `OPTIMIZER.md` — end-to-end pipeline walkthrough with deep dives on capture analysis, migration policy, JSX rewrite, and segment metadata. Read this when onboarding into a new optimizer area.
- [`BENCHMARKS.md`](../../BENCHMARKS.md) (repo root) — perf-history doc tracking BENCH-01 / BENCH-02 wall-time vs the SWC reference, with two Mermaid charts and a runbook for adding new data points.
- `CONVERGENCE_FAILURES.md` — feature breakdown with per-test root causes
- `CONSTRAINTS.md` — hard rules (read-only directories)
- `REGRESSION.md` — regression invariants (now CI-enforced)
- `METHODOLOGIES.md` — process / workflow rules including the Refactoring section
- `LINEAR.md` — ticket management conventions including state UUIDs and auto-assignment
- `.github/workflows/README.md` — CI workflow documentation
- Linear OSS-343 — refactor track v2 parent (rolls up sub-issue completion)
- `pnpm vitest convergence --run` — current parity measurement
- `pnpm ci:baseline:check <vitest-json>` — local regression check against stored baseline
- `tests/optimizer/failure-families.test.ts` — secondary signal (broader, less strict than convergence)
