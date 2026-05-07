# GitHub Actions workflows

| File | Trigger | Purpose |
|---|---|---|
| `test.yml` | `pull_request` to `main` | Typecheck + full vitest suite + name-based regression check against `.ci/baseline.json`. Gate for PRs. |
| `update-baseline.yml` | `push` to `main` | Re-runs the suite and auto-commits a refreshed `.ci/baseline.json` if test outcomes changed. Uses `[skip ci]` to avoid recursion. |

## Node version

Both workflows pin `node-version: 22`. Node 20 is **not** supported — `oxc-parser`'s `experimentalRawTransfer` option (used in `src/ast-types.ts`) throws unconditionally on Node 20, cascading into ~274 test failures. `package.json` `engines.node` reflects the same `>=22` requirement.

## History

- Initial design and infrastructure: [OSS-341](https://linear.app/kunai/issue/OSS-341).
- Workflows were briefly parked at `.yml.disabled` while [OSS-342](https://linear.app/kunai/issue/OSS-342) tracked an apparent macOS/Linux test divergence. Root cause turned out to be Node 20 vs Node 22, not a platform issue. Fix: bump `node-version` in both workflows to 22.
