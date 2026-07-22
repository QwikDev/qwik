# TS Optimizer

A rewrite of the Rust SWC optimizer (preserved in `./swc-reference-only`)
in TypeScript using OXC. The correctness target is `./match-these-snaps`
— 209 snapshots from the Rust optimizer that define what our output
should converge to.

Run `pnpm vitest convergence` to measure. Formatting and import order
aren't checked; only semantic AST equivalence and segment metadata
identity matter.

## External references

- `$QWIK_HOME` points to a local clone of the Qwik framework.
- The current Rust SWC optimizer lives at
  `$QWIK_HOME/packages/optimizer`, with source under `./core`.
- `./swc-reference-only` in this repo is a pinned snapshot of that
  source for offline reference during the rewrite.

## Definition of progress

Progress is measured in one direction: convergence test count going up,
with no regressions on previously-passing tests or on the broader test
suite. A change that doesn't flip a test forward (or isn't an
explicitly-justified refactor under METHODOLOGIES.md) isn't making
progress, regardless of how clean the diff is.

## Authority by topic

All files in `.claude/rules/` are loaded each turn. Use this table to
decide which file is authoritative for a given decision.

| For decisions about...                                       | Authority                  |
| ------------------------------------------------------------ | -------------------------- |
| TypeScript style in `src/`                                   | `CODING_BEST_PRACTICES.md` |
| Optimizer pipeline shape, phases, conventions                | `OPTIMIZER.md`             |
| Open convergence failures and feature work                   | `CONVERGENCE_FAILURES.md`  |
| Git workflow, PRs, refactors, post-merge cleanup             | `METHODOLOGIES.md`         |
| Linear tickets (drafting, creating, transitions)             | `LINEAR.md`                |
| Portable-skill bindings (tracker + state file + conventions) | `PROJECT.md`               |
| Branch state, in-flight work, recent merges                  | `STATE.md`                 |
| Regression risk reasoning                                    | `REGRESSION.md`            |
| Hard prohibitions                                            | `CONSTRAINTS.md`           |

## Resolving conflicts between files

- `CONSTRAINTS.md` is absolute — its prohibitions override every other
  file.
- `OPTIMIZER.md` (stable, structural) wins over `STATE.md` (branch-scoped,
  working) on questions about the pipeline's intended shape.
- `METHODOLOGIES.md`'s "Pipeline-touching refactors must audit
  OPTIMIZER.md" is load-bearing: refactors that change any module in
  OPTIMIZER.md's trigger checklist require a doc update in the same PR.
- `CONVERGENCE_FAILURES.md`'s suggested implementation order is the
  default sequence for new feature work unless the user has explicitly
  directed otherwise in chat.

## Top-level defaults

- Confirm before destructive operations (branch deletion, history
  rewrite, issue archival, file deletion outside `/tmp`).
- Draft Linear tickets in chat before creating them.
- Don't open PRs unless the work flips a test or is an explicitly-
  labeled refactor branch.