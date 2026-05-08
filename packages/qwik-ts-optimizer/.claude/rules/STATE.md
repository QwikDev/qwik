# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-05-08 (OSS-346 implementation done; PR #14 open)

## Goal

**Active workstream:** optimizer codebase refactor track v2 — segment generation cleanup. Tracked under Linear parent **[OSS-343](https://linear.app/kunai/issue/OSS-343)**. Continues the audit follow-up work from track v1 ([OSS-337](https://linear.app/kunai/issue/OSS-337), closed). OSS-344 (PR #12) and OSS-345 (PR #13) merged; current ticket is **[OSS-346](https://linear.app/kunai/issue/OSS-346)** — extract per-phase helpers from `generateSegmentCode` in `segment-codegen.ts:444`.

**Long-term project goal:** 100% snapshot test parity between the TypeScript optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`. The refactor track is a side-track that pauses parity feature work to make subsequent feature work easier.

## Current measurements

These are the baselines the refactor track must not regress (`REGRESSION.md`). The CI gate now enforces them automatically on every PR — see "CI infrastructure" below.

| Metric | Value |
|---|---|
| Convergence failing | **33 / 212** |
| Convergence passing | **179 / 212** (84.4%) |
| Full suite failing | 56 / 696 |
| Full suite passing | 640 / 696 |
| Last verified | 2026-05-08 on `main` (post OSS-345 merge) |

## CI infrastructure (live)

Landed via [OSS-341](https://linear.app/kunai/issue/OSS-341) and unblocked via [OSS-342](https://linear.app/kunai/issue/OSS-342):

- **`.github/workflows/test.yml`** — runs on every PR to `main`. Steps: typecheck → full vitest → name-based regression check against `.ci/baseline.json`. Fails the PR if any baseline-passing test ID is now failing.
- **`.github/workflows/update-baseline.yml`** — runs on push to `main`. Regenerates `.ci/baseline.json` from a fresh test run; commits via `github-actions[bot]` with `[skip ci]` if the passing set changed.
- **Node version requirement: `>=22`** (encoded in `package.json` `engines.node`). `oxc-parser`'s `experimentalRawTransfer` throws on Node 20 — was the root cause of the apparent macOS/Linux divergence in OSS-342.
- **End-to-end smoke-tested** red-and-green via the throw-away PR #9 (closed unmerged): regression check correctly fails on intentional break, passes on revert.
- **Validated on real PRs**: PR #10 (OSS-339), PR #11 (OSS-340), PR #12 (OSS-344), and PR #13 (OSS-345) all ran the gate green.

Helpful local commands:

- `pnpm typecheck` — runs `tsc --noEmit`
- `pnpm ci:baseline:check <vitest-json>` — local regression check against the stored baseline
- `pnpm ci:baseline:update <vitest-json>` — regenerate baseline locally (rare; auto-update on main is preferred)
- `node scripts/diff-platform-results.mjs <vitest-json>` — diff a vitest JSON against the baseline (cross-environment investigation tool)

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `9fc30c3` (post OSS-345 merge) | ✅ | baseline | All v1 + OSS-344/345 of v2 landed |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster paused; will need rebase onto current `main` (which now contains F1 const-declarator fix, F4 MIG-05a refactor, body-transforms cleanup, predicates module, predicates v2, immutable field maps, and CI gate) before resuming |
| `refactor/generate-segment-code-phases` | `7243375` | ✅ | baseline | **active workstream** — OSS-346 PR #14 open |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343))

| Ticket | Title | Branch | Status |
|---|---|---|---|
| [OSS-343](https://linear.app/kunai/issue/OSS-343) | Refactor track v2 — segment generation cleanup *(parent)* | (no branch) | Backlog (auto-rolls up) |
| [OSS-344](https://linear.app/kunai/issue/OSS-344) | Consolidate `isStrippedSegment` + `isAnyComponentCtx` into `rewrite/predicates.ts` | `refactor/predicates-followup` (merged) | **Done** (PR #12) |
| [OSS-345](https://linear.app/kunai/issue/OSS-345) | Pre-compute field maps in `segment-generation.ts` | `refactor/precompute-field-maps` (merged) | **Done** (PR #13) |
| [OSS-346](https://linear.app/kunai/issue/OSS-346) | Refactor `generateSegmentCode` 8-phase sequencer | `refactor/generate-segment-code-phases` | **In Review** (PR #14 open; assigned scott.t.weaver) |
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

- **2026-05-08** — [OSS-346](https://linear.app/kunai/issue/OSS-346) implementation done; PR #14 open. Extracted `collectInitialImports` (Phases 1–3) and `applyBodyTransforms` (Phase 4) helpers from the 87-line `generateSegmentCode` orchestrator in `segment-codegen.ts`; orchestrator drops to 35 lines. Three redundant `captureInfo?` probes consolidate inside the body helper; non-null assertion gone. Phases 5–9 stay inline. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-08** — [OSS-345](https://linear.app/kunai/issue/OSS-345) merged via PR #13. Replaced closure-mutated `fieldMapCache` in `segment-generation.ts` with an immutable `ReadonlyMap` built once before the per-extraction loop. Both call sites collapsed to single `Map.get`. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-07** — [OSS-344](https://linear.app/kunai/issue/OSS-344) merged via PR #12. `rewrite/predicates.ts` gains `isComponentCtx` (two-arm) + `isAnyComponentCtx` (three-arm); `isStrippedSegment` moved here from `strip-ctx.ts` (now codegen-only). 5 imports repointed; 2 inline OR-chains replaced. Convergence 33/212 + full-suite 56/696 unchanged.
- **2026-05-07** — Refactor track v2 kicked off. Parent [OSS-343](https://linear.app/kunai/issue/OSS-343) + 4 sub-issues created (OSS-344/345/346/347). OSS-344 is the active branch, picking up the predicates-consolidation thread from OSS-340.
- **2026-05-07** — [OSS-340](https://linear.app/kunai/issue/OSS-340) merged via PR #11. Closes refactor track v1. New module `src/optimizer/rewrite/predicates.ts` consolidates 3 predicates × 9 inline call sites.
- **2026-05-07** — [OSS-339](https://linear.app/kunai/issue/OSS-339) merged via PR #10. `body-transforms.ts` cleanup: named `OUTERMOST_BODY_THRESHOLD`, `formatWCall`, `spliceWithinBody`. First PR to validate the CI gate end-to-end.
- **2026-05-07** — [OSS-342](https://linear.app/kunai/issue/OSS-342) merged via PR #8. CI unblocked: Node bumped 20 → 22, workflow files re-enabled. Phantom submodule references at `.claude/worktrees/*` cleaned up. Diagnosis was the macOS/Linux "divergence" was actually `oxc-parser`'s `experimentalRawTransfer` requiring Node 22+.
- **2026-05-07** — [OSS-341](https://linear.app/kunai/issue/OSS-341) merged via PR #7. CI infrastructure: name-based regression check (`scripts/check-regression.mjs`), auto-baseline workflow (`scripts/update-baseline.mjs`), `.ci/baseline.json`. Workflows briefly parked at `.yml.disabled` while OSS-342 investigation ran.
- **2026-05-07** — [OSS-338](https://linear.app/kunai/issue/OSS-338) merged via PR #6. `variable-migration.ts` cleanup: `MIG_REASON` const, `usingSegmentsOf` helper, named MIG-05a post-pass with JSDoc preconditions. Fixup commit renamed keys to action-prefixed style.
- **2026-05-07** — `METHODOLOGIES.md` "Refactoring" section added: codifies the four-question commit/Linear comment format (what / why-isolation / why-future / risk) and the long-form-first / commit-trimmed-from-it authoring pattern.
- **2026-05-06** — Audit run on the now-deleted `refactor/optimizer-audit` branch identified 7 candidates for the optimizer pipeline; 3 became refactor track v1 (OSS-338/339/340), 4 became refactor track v2 (OSS-344–347).

## What to do next

**Awaiting review:** [OSS-346](https://linear.app/kunai/issue/OSS-346) PR #14. Once merged, refresh STATE.md to point at OSS-347.

**Next up: [OSS-347](https://linear.app/kunai/issue/OSS-347) / `refactor/generate-all-segment-modules-spec`** — discovery-only ticket. Output is a SPEC for refactoring `generateAllSegmentModules` plus follow-up implementation tickets, not direct code. Branch not yet created.

When the v2 track wraps, parity work resumes by rebasing `ast-parity/F2` onto current `main`. The F2 cluster bugs (path normalisation, hash, key prefix, extra empty segment file) will then have access to the foundation built by tracks v1+v2: predicates module, named thresholds, helpers, immutable field maps, named phase functions.

## Maintenance

**You are expected to update this file actively.** Not a passive snapshot — a working artifact.

### Branch scoping

Unlike other files in `.claude/rules/` (CONSTRAINTS, REGRESSION, METHODOLOGIES, CONVERGENCE_FAILURES, LINEAR) which are project-wide rules edited and reviewed in isolation, **STATE.md is branch-scoped**. It reflects the active workstream of whatever branch it's committed on:

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
