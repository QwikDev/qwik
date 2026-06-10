# Methodologies and Guidelines

This set of rules provides general guidelines for methodologies to use when solving problems.

## Buy Versus Build

If there is an ecosystem library that solves a problem, prefer it over building a solution from scratch.

Web searches are permitted to acheive this goal.

Sources:
- https://unjs.io/

## Features and Branching

## Git Policies

When starting work on a new feature, we must do it in a new branch.  You should prompt as whether to branch from `main` or the currently checked out branch.

## Strive to add as little code as possible

Before making code changes or proposals, thoroughly evaluate the existing code and find places where existing logic can be reused.  Refactoring code to achieve this goal is encouraged.

The goal is the smallest **long-run** codebase, not the smallest diff. Better, more readable, and more reusable code should always trump strict "fewest lines" thinking — extracting a clear helper today (even at +10 lines) prevents +50 lines of duplication tomorrow. Over time, that is what keeps the codebase small.

What this still rules out:
- Speculative abstractions for hypothetical future requirements.
- Gratuitous wrapping (a one-line helper whose only job is to rename a call).
- Over-engineered classes when a function does the job.

What this encourages:
- Extracting a shared predicate / helper when the same check appears in three or more places.
- Renaming or splitting a function whose name no longer describes what it actually does.
- Promoting a pattern to a utility once a third call site appears.

When in doubt, optimise for the next reader, not the smallest patch.

## Push / PR only when tests flip

Branches should only be pushed to the remote and opened as PRs when the work moves the needle — i.e. flips at least one test from FAILED to PASSED (or, for general refactoring branches explicitly labeled as such, achieves a stated structural improvement).

Foundation work that prepares the way for a flip but does not itself flip a test should remain on a local branch until either:
- it can be combined with the work that achieves the flip into a single PR, or
- it is rolled into a successor feature branch that will eventually flip a test.

This keeps the remote and review queue focused on observable progress and avoids cluttering the project with in-flight scaffolding.

## After a PR merges

When a PR merges to `main`, the work is shipped but not yet **closed**. A small cleanup routine propagates the merge to the parts of the project that don't update themselves: the local repo, the remote, Linear, and `STATE.md`. Skipping any one creates drift — stale branches accumulate, Linear tickets read "In Progress" weeks after the code shipped, and `STATE.md` describes a world that no longer exists.

Run this as soon as the PR is merged. **Confirm with the user before the destructive steps** if acting unprompted — branch deletion is destructive; everything else is reversible.

### Checklist

1. **Pull `main` and switch off the merged branch.**
   ```
   git checkout main && git pull --ff-only
   ```
   Grounds the rest of the cleanup against the post-merge tip.

2. **Rebuild + re-sync qwik-bundler's dist when the merge touched `src/`.** The TS optimizer ships into [qwik-bundler](https://github.com/thejackshelton/qwik-bundler) as a pnpm `file:../TS-Optimizer` devDep, which pnpm snapshots as a **content-addressed copy at install time — not a live symlink**. After any merge that changes optimizer behavior, the bundler keeps silently running stale optimizer code under `experimental: ['tsOptimizer']` until the copy is refreshed:
   ```
   pnpm build
   rsync -a --delete dist/ \
     ../qwik-bundler/node_modules/.pnpm/qwik-optimizer-ts@file+..+TS-Optimizer_*/node_modules/qwik-optimizer-ts/dist/
   ```
   Verify by `grep`-ing the synced output for a string introduced by the merged change. If the store glob matches more than one directory (stale installs), don't rsync into a glob — run `pnpm install --force` in qwik-bundler instead. Skip this step for docs/tests-only merges. The same rule applies mid-development: **any** verification against the real bundler (dev SSR, `build.client`, Playwright) must be preceded by a fresh build + re-sync, or the result is meaningless.

3. **Delete the merged branch — local and remote.**
   ```
   git branch -d <branch-name>
   git push origin --delete <branch-name>
   ```
   Use `-d`, not `-D`. If `-d` refuses, the branch isn't actually merged — investigate before forcing. Squash-merged PRs may produce a warning like *"deleting branch ... merged to refs/remotes/origin/... but not yet merged to HEAD"* — that's expected and the deletion still proceeds.

4. **Verify the Linear ticket is Done.** The GitHub→Linear integration *usually* auto-flips a ticket from In Review → Done when its referenced PR merges, but it can miss (most often when the PR description's ticket reference uses a non-canonical format). Confirm by opening `linear.app/kunai/issue/OSS-XXX` or via the API. If it's still In Review or In Progress, flip it manually using the `issueUpdate` recipe in `LINEAR.md`.

5. **Refresh `STATE.md`** when the merge moves project state meaningfully.
   - **Always:** bump "Last updated"; update `main`'s head SHA in "Branches in flight" + "Current measurements"; remove the merged branch from "Branches in flight"; prepend an entry to "Most recent meaningful progress".
   - **As applicable:** update the "Active workstream" paragraph; trim the progress log if it exceeds ~10 entries; update "Refactor track" or "Parity feature status" tables if the PR moved one.
   - **Where to commit:** STATE.md edits go on a feature branch — never directly to `main` (per STATE.md's own Maintenance rules). Two valid patterns:
     - **Refresh-only PR** — preferred when several merges have batched up or the merge is significant (see PRs #19, #21, #25).
     - **Inline with the next active workstream branch's first commit** if a successor branch is already starting.

6. **Audit `OPTIMIZER.md` for pipeline-touching merges.** If the merged PR touched any file listed in OPTIMIZER.md's "Trigger checklist for pipeline refactors", and the PR did not already update OPTIMIZER.md, audit the doc against the change before continuing.
   - Most pipeline-touching changes are **type-internal** (renames, signature widening, brand propagation, helper extraction) and don't require a doc update — the conceptual contract OPTIMIZER.md describes is unchanged.
   - **Update OPTIMIZER.md only when the change is structural:** a phase added/removed/renumbered, a new tool-surface convention name, a migration rule changed, a worked-example snapshot replaced, an `ExtractionResult` field added/removed/repurposed, or file:line refs in OPTIMIZER.md drifted by >50 lines or moved files. See OPTIMIZER.md's "Maintenance" section for the full criteria.
   - **Fold the update into the same branch as the STATE.md refresh.** Both are docs-only edits under `.claude/rules/`; they ride the same auto-merge carve-out (see below).

7. **Auto-merge is fine for docs-only PRs under `.claude/rules/`.** The diff is pure documentation, low-risk, and gate-checked by CI like every other PR. This covers STATE.md (frequent), OPTIMIZER.md (when the audit above folds an update in), and the other rule files when modified in isolation. Queue them with `gh pr merge --auto --squash <pr-number>` (or the GitHub UI's auto-merge button) and let the CI pass trigger the merge — no manual review required. This applies *only* to PRs whose entire diff is under `.claude/rules/` (any combination of files in that directory). PRs that also touch source (`src/`), tests (`tests/`), or workflows (`.github/`) go through normal review. The CI gate runs identically on both.

### What "merged" means here

This routine fires when the PR's commits are reachable from `origin/main`. It does **not** fire on:

- A PR approved but not yet merged.
- A PR closed without merging — that has its own cleanup: Linear ticket → Cancelled (or back to Backlog if work will resume), branch deleted if abandoned, no `STATE.md` changes.

### Don't

- **Don't auto-delete the branch without confirming.** Especially when running unattended; especially with squash-merged PRs where the warning could mask an unintended state.
- **Don't edit `STATE.md` on `main` directly.** STATE.md's own Maintenance section forbids this. Always go through a feature branch + PR, even for tiny changes.
- **Don't extend auto-merge beyond `.claude/rules/`.** The exemption is narrow on purpose — source code (`src/`), tests (`tests/`), and workflows (`.github/`) affect runtime behavior and changes deserve a review eye. Rule-file-only PRs are the boundary; anything else goes through standard review.

## Refactoring

Refactors don't flip tests. They rely entirely on the explanation to justify themselves — both at review time and later, when someone is deciding whether to extend the new structure or revert it. The commit message and the Linear ticket comment are the durable record of *why*.

Every refactor commit + Linear comment must answer four questions:

1. **What changed.** Short summary of the edits — what was extracted, renamed, deduplicated, or restructured. Keep this terse; the diff is authoritative.
2. **Why it's beneficial in isolation.** What does the refactored code do better than the original? Be specific: removes silent duplication, surfaces preconditions at the boundary, names a recurring operation, eliminates a state machine, makes a policy enumerable. "Cleaner" is not a reason.
3. **Why it's a foundation for future work.** Which tickets, features, or known follow-ups become easier because of this change? Cite concrete artifacts (Linear IDs, feature names, file references in `CONVERGENCE_FAILURES.md`). If you can't name a beneficiary, the refactor is speculative — see "Strive to add as little code as possible."
4. **Risk.** What could go wrong, and what guards against it? Note the test counts at the boundary (e.g., "26/26 unit, 33/179 convergence, 56/640 full suite — unchanged from main") so the next reviewer can verify the same baselines you saw.

### Two forms

The same reasoning gets used twice:

- **Linear comment (long form)** — full structure with the four sections under markdown headings. Includes the future-work mapping in detail. Lives on the parent ticket so the rationale is searchable later.
- **Commit message (trimmed form)** — header under 70 chars, body 8–15 lines. Compress the isolation/foundation reasoning to bullets. Reference the Linear comment for the full version.

Author the long form first; the commit message is a trim of it, not the other way around. Trying to expand a commit message into a full Linear comment loses the future-work mapping — you have to think about it explicitly to write it.

### Avoid

- "Cleanup" / "refactor for clarity" with no specifics — these decay into hand-waving and don't help future readers.
- Listing every helper extracted — the diff already shows that. Focus on what the *shape* of the new code enables.
- Future-work claims with no concrete beneficiary. If no ticket / feature / file uses the new structure, it's speculative abstraction.

OSS-338 / [PR #6](https://github.com/thejackshelton/TS-Optimizer/pull/6) is a worked example of both forms.

### Pipeline-touching refactors must audit OPTIMIZER.md

Refactors that touch any module listed in `OPTIMIZER.md`'s "Trigger checklist for pipeline refactors" carry an additional obligation: audit `OPTIMIZER.md` against the change before merging the PR. The doc captures the optimizer's stable structural shape (phase numbering, file:line refs, tool/author convention names, worked-example snapshots), and silent drift between the doc and the code is the easy failure mode — there's no test that catches it.

Fold the doc update into the same PR as the code change. Doc-only catch-up PRs are fine when drift is discovered later, but they're a sign the process leaked.

See `OPTIMIZER.md` "Maintenance" section for the full checklist and triggers.
