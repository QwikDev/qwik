# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-05-08 (post OSS-351 fold-in optimization + OSS-348 state cleanup; OSS-352 filed as backlog; OSS-347 still the only remaining track v2 ticket)

## Goal

**Active workstream:** between workstreams. Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343)) implementation work is closed — OSS-344 (PR #12), OSS-345 (PR #13), and OSS-346 (PR #14) all merged. The only remaining track v2 ticket is **[OSS-347](https://linear.app/kunai/issue/OSS-347)**, a discovery-only SPEC for `generateAllSegmentModules` that produces follow-up implementation tickets rather than direct code. Doc/types/perf side-tracks also shipped this session: OPTIMIZER.md walkthrough + Maintenance governance ([OSS-348](https://linear.app/kunai/issue/OSS-348), PR #15), REGRESSION.md mechanism rewrite (PR #16, no ticket), types.ts JSDoc parity ([OSS-349](https://linear.app/kunai/issue/OSS-349), PR #17), `extractSegments` `preParsedModule` plumbing ([OSS-350](https://linear.app/kunai/issue/OSS-350), PR #18), and `extract.ts` JSX-extension fold-in ([OSS-351](https://linear.app/kunai/issue/OSS-351), PR #20). One backlog item filed during the OSS-351 review: [OSS-352](https://linear.app/kunai/issue/OSS-352) (`inlinedQrl` extension JSX-detection investigation).

**Long-term project goal:** 100% snapshot test parity between the TypeScript optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`. The refactor track is a side-track that pauses parity feature work to make subsequent feature work easier.

## Current measurements

These are the baselines the refactor track must not regress (`REGRESSION.md`). The CI gate now enforces them automatically on every PR — see "CI infrastructure" below.

| Metric | Value |
|---|---|
| Convergence failing | **33 / 212** |
| Convergence passing | **179 / 212** (84.4%) |
| Full suite failing | 56 / 696 |
| Full suite passing | 640 / 696 |
| Last verified | 2026-05-08 on `main` (post OSS-351 merge, head `83f2804`) |

## CI infrastructure (live)

Landed via [OSS-341](https://linear.app/kunai/issue/OSS-341) and unblocked via [OSS-342](https://linear.app/kunai/issue/OSS-342):

- **`.github/workflows/test.yml`** — runs on every PR to `main`. Steps: typecheck → full vitest → name-based regression check against `.ci/baseline.json`. Fails the PR if any baseline-passing test ID is now failing.
- **`.github/workflows/update-baseline.yml`** — runs on push to `main`. Regenerates `.ci/baseline.json` from a fresh test run; commits via `github-actions[bot]` with `[skip ci]` if the passing set changed.
- **Node version requirement: `>=22`** (encoded in `package.json` `engines.node`). `oxc-parser`'s `experimentalRawTransfer` throws on Node 20 — was the root cause of the apparent macOS/Linux divergence in OSS-342.
- **End-to-end smoke-tested** red-and-green via the throw-away PR #9 (closed unmerged): regression check correctly fails on intentional break, passes on revert.
- **Validated on real PRs**: every refactor-track PR through PR #20 has run the gate green — PR #10 (OSS-339), PR #11 (OSS-340), PR #12 (OSS-344), PR #13 (OSS-345), PR #14 (OSS-346), PR #17 (OSS-349 docs-only), PR #18 (OSS-350), PR #20 (OSS-351). Doc-only PRs (PR #15 OSS-348, PR #16 REGRESSION, PR #19 STATE refresh) also ran clean since they don't change source.

Helpful local commands:

- `pnpm typecheck` — runs `tsc --noEmit`
- `pnpm ci:baseline:check <vitest-json>` — local regression check against the stored baseline
- `pnpm ci:baseline:update <vitest-json>` — regenerate baseline locally (rare; auto-update on main is preferred)
- `node scripts/diff-platform-results.mjs <vitest-json>` — diff a vitest JSON against the baseline (cross-environment investigation tool)

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `83f2804` (post OSS-351 merge) | ✅ | baseline | All track v1 + track v2 implementation work landed; OPTIMIZER.md / REGRESSION.md / types.ts JSDoc / extract.ts JSX fold-in shipped |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster paused; will need rebase onto current `main` (which now contains F1 const-declarator fix, F4 MIG-05a refactor, body-transforms cleanup, predicates module + predicates v2, immutable field maps, generateSegmentCode phase helpers, single-parse plumbing, and CI gate) before resuming |
| _(no active workstream branch)_ | — | — | — | Between tracks; OSS-347 is the next ticket and its branch hasn't been created yet |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343))

| Ticket | Title | Branch | Status |
|---|---|---|---|
| [OSS-343](https://linear.app/kunai/issue/OSS-343) | Refactor track v2 — segment generation cleanup *(parent)* | (no branch) | Backlog (auto-rolls up) |
| [OSS-344](https://linear.app/kunai/issue/OSS-344) | Consolidate `isStrippedSegment` + `isAnyComponentCtx` into `rewrite/predicates.ts` | `refactor/predicates-followup` (merged) | **Done** (PR #12) |
| [OSS-345](https://linear.app/kunai/issue/OSS-345) | Pre-compute field maps in `segment-generation.ts` | `refactor/precompute-field-maps` (merged) | **Done** (PR #13) |
| [OSS-346](https://linear.app/kunai/issue/OSS-346) | Refactor `generateSegmentCode` 8-phase sequencer | `refactor/generate-segment-code-phases` (merged) | **Done** (PR #14) |
| [OSS-347](https://linear.app/kunai/issue/OSS-347) | Discovery + plan for `generateAllSegmentModules` refactor *(planning ticket — produces SPEC + sub-tickets, not direct code)* | `refactor/generate-all-segment-modules-spec` (not yet created) | Backlog |

Each implementation sub-issue has explicit acceptance criteria including convergence + full-suite no-regression bounds. Per-PR commit messages follow the four-question format from `METHODOLOGIES.md` "Refactoring" section.

## Refactor track v1 ([OSS-337](https://linear.app/kunai/issue/OSS-337)) — closed

All sub-issues merged and closed. Worth recording the shape because v2 follows the same playbook.

| Ticket | Outcome |
|---|---|
| OSS-338 | Extracted `MIG_REASON` const + `usingSegmentsOf` helper + named MIG-05a post-pass with JSDoc preconditions in `variable-migration.ts`. Renamed keys to action-prefixed style in a fixup commit. |
| OSS-339 | Named `OUTERMOST_BODY_THRESHOLD` magic constant + `formatWCall` helper + `spliceWithinBody` helper in `body-transforms.ts`. |
| OSS-340 | New module `rewrite/predicates.ts` consolidating `matchesRegCtxName` (3 byte-identical duplicates), `isEventHandlerOrJsxProp`, `hasUnderscorePlaceholderParams` across 4 files. |

## Parity feature status (paused, awaiting refactor track v2 close)

Snapshot from before the refactor track started. Numeric features track the original `CONVERGENCE_FAILURES.md` grouping. Suffix letters (F1b, F1c) are sub-features that emerged from in-flight rescoping.

| Feature | Status | Test(s) | Brief |
|---|---|---|---|
| F1 — `_ref` indirection | ✅ CLOSED | `component_level_self_referential_qrl` | shipped via PR #5; const-declarator fix added during review |
| F1b — mutual-recursion migration | OPEN | `example_self_referential_component_migration` | not started; deeper migration policy than F4 |
| F1c — inline-strategy emit ordering | LANDED (foundation only) | `root_level_self_referential_qrl_inline` | statement-order fix lives on `ast-parity/F2`; test won't flip until F2 also fixes path/hash/key-prefix bugs |
| F2 — hoisted / inline / lib strategies | PAUSED | 5–6 tests | active before refactor track started; resume on rebased `ast-parity/F2`. **The refactor track has now built foundation for F2:** named threshold, formatWCall, spliceWithinBody, predicates module. |
| F3 — `_rawProps` lightweight components | OPEN | 4 tests | 8 coordinated changes; bigger than original 1-pass scoping. Will reuse `isComponentCtx` + `isAnyComponentCtx` from OSS-344 once that lands. |
| F4 — MIG-05a shared destructure | LANDED partial | `example_invalid_references` | parent passes; segments still fail. OSS-338 cleaned the code path; nested-segment migration is the next step. |
| F5 — server-marker stripping → null body | OPEN | 3 tests |  |
| F6 — JSX runtime preservation | OPEN | 3 tests |  |
| F7 — inner-function extraction discipline | OPEN | 4 tests + `fun_with_scopes` from F8 |  |
| F8 — diverse semantic bugs | OPEN | 5 tests | each test needs its own fix |
| F9 — spread / var / const splitting | OPEN | 2 tests |  |
| F10 — import-aware naming | OPEN | 2 tests |  |

Full feature analysis: `CONVERGENCE_FAILURES.md`.

## Most recent meaningful progress

Most recent first. Trim entries older than ~10 to keep this file from bloating.

- **2026-05-08** — [OSS-351](https://linear.app/kunai/issue/OSS-351) merged via PR #20. `extract.ts` folds the per-extraction `walk(arg, ...)` JSX-detection subtree walk into the main `walk(program, ...)`. Active-segment stack maintained on enter/leave of each extraction's wrapping node; per-segment `hasJsx` is flipped when an enclosed `JSXElement`/`JSXFragment` is visited; the file extension is finalised once at pop time via `extensionFromSegmentJsx`. `defaultExtension` hoisted to a per-call constant; `nodeContainedIn` defensive guard added; old `determineExtension` helper removed. Companion backlog item [OSS-352](https://linear.app/kunai/issue/OSS-352) filed during review for the pre-existing `inlinedQrl` path's lack of JSX detection (out-of-scope here). Convergence 33/212 + full-suite 56/696 unchanged. Also: [OSS-348](https://linear.app/kunai/issue/OSS-348) state cleanup — moved In Review → Done now that PR #15 has been merged for several commits.
- **2026-05-08** — [OSS-350](https://linear.app/kunai/issue/OSS-350) merged via PR #18. `extractSegments` gains optional `preParsedModule` companion to `preParsedProgram`; `transform/index.ts` lifts the post-repair `{program, module}` parse to a single point right after Phase 0 via direct destructuring. Closes a latent gap where `collectImports` got `undefined` module on the pre-parsed-program path. Foundation for OSS-347's single-shared-AST reasoning. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-08** — [OSS-349](https://linear.app/kunai/issue/OSS-349) merged via PR #17. `types.ts` gains class-level + per-field/per-variant JSDoc on every exported type — `TransformModulesOptions`, `TransformModuleInput`, `TransformOutput`, `TransformModule`, `SegmentAnalysis`, `SegmentMetadataInternal`, `EntryStrategy`, `MinifyMode`, `EmitMode`, `DiagnosticHighlightFlat`, `Diagnostic`. NAPI-parity-only fields (`rootDir`, `sourceMaps`, `preserveFilenames`, `Diagnostic.suggestions`) explicitly flagged; verified by grep. Comment-only change.
- **2026-05-08** — `REGRESSION.md` rewritten via PR #16 (no Linear ticket — small docs improvement). Coarse two-sentence "success rate must not decrease" rule replaced with the actual mechanism: set-based invariant, baseline file shape, the two scripts (`check-regression.mjs` / `update-baseline.mjs`), the two workflows (`test.yml` PR gate + `update-baseline.yml` push-to-main auto-baseline), failure-mode decision tree, local-equivalent commands.
- **2026-05-08** — [OSS-348](https://linear.app/kunai/issue/OSS-348) merged via PR #15. New project-wide rule file `.claude/rules/OPTIMIZER.md` (~860 lines). End-to-end pipeline walkthrough using `example_1` worked example, 9-phase pipeline table, four deep dives (capture analysis, migration policy, JSX rewrite, segment metadata), the marker family triad + catalog, consolidated symbol-naming-and-hashing section, plus a Maintenance section governing how the doc stays current with active development. Cross-linked from `STATE.md` and `METHODOLOGIES.md`.
- **2026-05-08** — [OSS-346](https://linear.app/kunai/issue/OSS-346) merged via PR #14. Extracted `collectInitialImports` (Phases 1–3) and `applyBodyTransforms` (Phase 4) helpers from the 87-line `generateSegmentCode` orchestrator in `segment-codegen.ts`; orchestrator drops to 35 lines. Three redundant `captureInfo?` probes consolidated inside the body helper; non-null assertion gone. Phases 5–9 stay inline. Closes refactor track v2 implementation work. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-08** — [OSS-345](https://linear.app/kunai/issue/OSS-345) merged via PR #13. Replaced closure-mutated `fieldMapCache` in `segment-generation.ts` with an immutable `ReadonlyMap` built once before the per-extraction loop. Both call sites collapsed to single `Map.get`. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-07** — [OSS-344](https://linear.app/kunai/issue/OSS-344) merged via PR #12. `rewrite/predicates.ts` gains `isComponentCtx` (two-arm) + `isAnyComponentCtx` (three-arm); `isStrippedSegment` moved here from `strip-ctx.ts` (now codegen-only). 5 imports repointed; 2 inline OR-chains replaced. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-07** — Refactor track v2 kicked off. Parent [OSS-343](https://linear.app/kunai/issue/OSS-343) + 4 sub-issues created (OSS-344/345/346/347). OSS-344 is the active branch, picking up the predicates-consolidation thread from OSS-340.
- **2026-05-07** — [OSS-340](https://linear.app/kunai/issue/OSS-340) merged via PR #11. Closes refactor track v1. New module `src/optimizer/rewrite/predicates.ts` consolidates 3 predicates × 9 inline call sites.

## What to do next

**Track v2 implementation is closed.** OSS-344, OSS-345, and OSS-346 all merged. Only [OSS-347](https://linear.app/kunai/issue/OSS-347) remains in the track and it is **discovery-only** — its output is a SPEC for refactoring `generateAllSegmentModules` plus follow-up implementation tickets, not direct code. When you start it: branch as `refactor/generate-all-segment-modules-spec`, refresh this STATE.md to mark OSS-347 In Progress, and read `OPTIMIZER.md`'s "Quick reference — code map" + the segment-generation deep dive for the orchestrator's current shape.

**After OSS-347 produces its sub-tickets**, parity work resumes by rebasing `ast-parity/F2` onto current `main`. The F2 cluster bugs (path normalisation, hash, key prefix, extra empty segment file) will then have access to the foundation built by tracks v1+v2: predicates module, named thresholds, helpers, immutable field maps, named phase functions, single-shared-AST plumbing, and a documented pipeline contract in `OPTIMIZER.md`.

**[OSS-352](https://linear.app/kunai/issue/OSS-352)** is a small standalone investigation backlog item (does the `inlinedQrl` extraction path need the same JSX-detection treatment OSS-351 added to the marker / JSX-attr paths?). It can be picked up at any time without disrupting OSS-347 or the F2 cluster.

**If you're between sessions and need to pick up cold:** read `OPTIMIZER.md` first — the Two-namespaces section + the Phase pipeline table + the marker catalog give you the working vocabulary. Then check Linear OSS-343 for the parent's roll-up status and OSS-347 for what's still open.

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
