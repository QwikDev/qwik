# GitHub Actions workflows

## Currently disabled

Both workflows in this directory are parked with a `.disabled` suffix. GitHub
Actions only scans `.yml` / `.yaml` files, so renamed files are not picked up.

| File | Trigger |
|---|---|
| `test.yml.disabled` | `pull_request` to `main` (PR gate) |
| `update-baseline.yml.disabled` | `push` to `main` (baseline auto-update) |

## Why

The infrastructure built under [OSS-341](https://linear.app/kunai/issue/OSS-341)
(name-based regression check + auto-baseline) is sound, and a single CI run
exercised it end-to-end. That run revealed two problems that have to be solved
before the gates can be enabled safely:

1. **macOS ↔ Linux test divergence.** On the Linux runner, **3 / 212**
   convergence tests pass and **366 / 696** full-suite tests pass — vs
   **179 / 212** and **640 / 696** locally on macOS. With the baseline
   captured on macOS, the regression check on every PR would report ~274
   "regressions" that are really platform-specific pre-existing failures.
2. **Phantom submodule reference.** `.claude/worktrees/const-idents` is
   tracked as a submodule but has no entry in `.gitmodules`, so any
   `git push` from the workflow's checkout fails with
   `fatal: No url found for submodule path '.claude/worktrees/const-idents'`.

Both are tracked in Linear (see ticket created alongside this commit).

## Re-enabling

Once the divergence is investigated and resolved (or the baseline is
regenerated on Linux as the source of truth), restoring the gates is a
one-command revert per file:

```sh
git mv .github/workflows/test.yml.disabled .github/workflows/test.yml
git mv .github/workflows/update-baseline.yml.disabled .github/workflows/update-baseline.yml
```

The workflow contents themselves are unchanged from OSS-341.
