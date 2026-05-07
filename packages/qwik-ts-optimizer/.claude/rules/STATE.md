# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-05-07 (refactor track kicked off)

## Goal

**Active workstream:** optimizer codebase refactor track (audit follow-up). Reduce friction in modules that F2–F10 parity work touches repeatedly, before scaling further feature work. Tracked under Linear parent **OSS-337**.

**Long-term project goal:** 100% snapshot test parity between the TypeScript optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`. The refactor track is a side-track that pauses parity feature work to make subsequent feature work easier.

## Current measurements

These are the baselines the refactor track must not regress (`REGRESSION.md`):

| Metric | Value |
|---|---|
| Convergence failing | **33 / 212** |
| Convergence passing | **179 / 212** (84.4%) |
| Full suite failing | 56 / 696 |
| Full suite passing | 640 / 696 |
| Last verified | 2026-05-07 on `main` (`f95b268`) |

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `f95b268` | ✅ | baseline | F1 PR merged + rule-doc updates (methodologies nuance, Linear state IDs) |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster paused; needs rebase onto current `main` (now contains F1 const-declarator fix and test hardening) before resuming. Carries F1c statement-ordering as foundation. |
| `refactor/optimizer-audit` | `f95b268` | ❌ local-only | n/a | scratch branch where the codebase audit ran; no commits of its own. Safe to delete once refactor branches are underway. |
| `refactor/mig-05a-post-pass` | (active) | ❌ local-only | baseline | **active workstream** — OSS-338. |

## Refactor track (OSS-337)

| Ticket | Title | Branch | Status |
|---|---|---|---|
| [OSS-337](https://linear.app/kunai/issue/OSS-337) | Optimizer pipeline refactor track — audit follow-up | (parent — no branch) | Backlog |
| [OSS-338](https://linear.app/kunai/issue/OSS-338) | Refactor MIG-05a post-pass in `variable-migration.ts` | `refactor/mig-05a-post-pass` | **In Progress** |
| [OSS-339](https://linear.app/kunai/issue/OSS-339) | Refactor `rewriteNestedCallSitesInline` in `body-transforms.ts` | `refactor/nested-callsite-rewrite` (not yet created) | Backlog |
| [OSS-340](https://linear.app/kunai/issue/OSS-340) | Refactor `transformInlineSegmentBody` gating logic in `inline-body.ts` | `refactor/inline-body-gating` (not yet created) | Backlog |

Each sub-issue has explicit acceptance criteria including the convergence/full-suite no-regression bound.

## Parity feature status (paused)

Snapshot from before the refactor track started. Numeric features track the original `CONVERGENCE_FAILURES.md` grouping. Suffix letters (F1b, F1c) are sub-features that emerged from in-flight rescoping.

| Feature | Status | Test(s) | Brief |
|---|---|---|---|
| F1 — `_ref` indirection | ✅ CLOSED | `component_level_self_referential_qrl` | shipped via PR #5; const-declarator fix added during review |
| F1b — mutual-recursion migration | OPEN | `example_self_referential_component_migration` | not started; deeper migration policy than F4 |
| F1c — inline-strategy emit ordering | LANDED (foundation only) | `root_level_self_referential_qrl_inline` | statement-order fix lives on `ast-parity/F2`; test won't flip until F2 also fixes path/hash/key-prefix bugs |
| F2 — hoisted / inline / lib strategies | PAUSED | 5–6 tests | active before refactor track started; resume on rebased `ast-parity/F2` |
| F3 — `_rawProps` lightweight components | OPEN | 4 tests | 8 coordinated changes; bigger than original 1-pass scoping |
| F4 — MIG-05a shared destructure | LANDED partial | `example_invalid_references` | parent module passes; segments still fail (nested-segment migration not applied — separate bug). OSS-338 refactor will tighten this code path. |
| F5 — server-marker stripping → null body | OPEN | 3 tests |  |
| F6 — JSX runtime preservation | OPEN | 3 tests |  |
| F7 — inner-function extraction discipline | OPEN | 4 tests + `fun_with_scopes` from F8 |  |
| F8 — diverse semantic bugs | OPEN | 5 tests | each test needs its own fix |
| F9 — spread / var / const splitting | OPEN | 2 tests |  |
| F10 — import-aware naming | OPEN | 2 tests |  |

Full feature analysis with file/line pointers: `CONVERGENCE_FAILURES.md` in this directory.

## Most recent meaningful progress

Most recent first. Trim older entries when this list exceeds ~10.

- **2026-05-07** — Refactor track kicked off. Audit (`refactor/optimizer-audit`) identified 7 candidates ranked by value-per-blast-radius. Parent OSS-337 + three sub-issues OSS-338/339/340 created. OSS-338 (MIG-05a) is the first active branch.
- **2026-05-07** — `METHODOLOGIES.md` clarified: "minimum code" rule explicitly favours long-run readability/reusability over shortest diff. Helpers / shared predicates encouraged at 3+ call sites.
- **2026-05-07** — `LINEAR.md` updated with `In Progress` and `In Review` state UUIDs alongside the existing `Backlog`, saving a re-probe round-trip.
- **2026-05-07** — F1 PR #5 merged into `main`. Convergence stays 33/212 (one test had already flipped pre-merge); full suite grew 692 → 696 from new test cases, all passing.
- **2026-05-07** — Copilot autofix on F1 PR added explicit assertions to `tests/optimizer/variable-migration.test.ts` (length, varName, action). Pure hardening, no production-code change.
- **2026-05-07** — `ast-parity/F1.c` renamed to `ast-parity/F2`; F1c statement-ordering folded in as foundation. Branch is parked on stale F1 base; needs rebase before resuming.
- **2026-05-07** — F1 simplified (`refactor(F1)`): 89→47 lines on `applySelfRefIndirection`, renamed companion to `applyRawPropsToSegmentBody`.
- **2026-05-07** — Linear issues OSS-334/335/336 filed for codebase-wide silent-bailout audit (parent + 2 sub-issues, all `Backlog` / `TECH DEBT`).
- **2026-05-06** — F1 `_ref` indirection landed. `component_level_self_referential_qrl` flipped to passing. Convergence 34→33.
- **2026-05-06** — F4 MIG-05a refinement landed for shared destructures flowing to one segment. Parent passes; segments still fail.

## What to do next

Active: **OSS-338 / `refactor/mig-05a-post-pass`** — extract MIG-05a as a named post-pass with explicit preconditions and a single eligibility helper. Acceptance criteria captured in the Linear issue. Convergence baseline (33 / 212) and full-suite baseline (56 / 696) must not regress.

After OSS-338 lands, OSS-339 and OSS-340 are next in queue. Each is its own branch off `main` and its own PR.

When the refactor track wraps, resume parity work by rebasing `ast-parity/F2` onto current `main` (the const-declarator restriction and test hardening from PR #5 will need to apply cleanly).

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
5. Update the "Branches in flight", "Refactor track", and "Parity feature status" tables if any changed.

## Where to look for more

- `CONVERGENCE_FAILURES.md` — feature breakdown with per-test root causes
- `CONSTRAINTS.md` — hard rules (read-only directories)
- `REGRESSION.md` — regression invariants
- `METHODOLOGIES.md` — process / workflow rules
- `LINEAR.md` — ticket management conventions
- Linear OSS-337 — refactor track parent (rolls up sub-issue completion)
- `pnpm vitest convergence --run` — current parity measurement
- `tests/optimizer/failure-families.test.ts` — secondary signal (broader, less strict than convergence)
