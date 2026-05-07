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

## Push / PR only when tests flip

Branches should only be pushed to the remote and opened as PRs when the work moves the needle — i.e. flips at least one test from FAILED to PASSED (or, for general refactoring branches explicitly labeled as such, achieves a stated structural improvement).

Foundation work that prepares the way for a flip but does not itself flip a test should remain on a local branch until either:
- it can be combined with the work that achieves the flip into a single PR, or
- it is rolled into a successor feature branch that will eventually flip a test.

This keeps the remote and review queue focused on observable progress and avoids cluttering the project with in-flight scaffolding.
