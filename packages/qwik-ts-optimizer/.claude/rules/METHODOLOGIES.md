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
