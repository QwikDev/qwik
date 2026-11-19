---
name: qwik-ci-development
description: Use when editing or debugging Qwik's CI: .github/workflows/ci.yml, the composite actions under .github/actions, flake.nix, or the Nix derivations in nix/ci.nix that build and test the repo.
---

# Qwik CI Development

Everything CI builds or tests on Linux is a Nix derivation in `nix/ci.nix`. The workflow only asks
which outputs are missing from the build cache and builds those. Keep the repo-wide rules from
`.ruler/AGENTS.md` in force, the Security And Supply Chain rule above all.

## Fast Path

1. A build or test changes: edit its derivation in `nix/ci.nix`, not the workflow.
2. Build it locally, then build it again and see the second run do nothing:

   ```bash
   nix build .#qwik-packages -L
   nix build .#ci.dev.checks.unit -L
   ```

   CI only runs these on x86_64 Linux; other systems are untested.

3. A job for Windows or macOS changes: edit `.github/workflows/ci.yml`. Those jobs have no Nix; they
   test the `artifact-dist` that the Linux build uploads.
4. Lint the workflow: `nix run nixpkgs#actionlint -- .github/workflows/ci.yml`.

## Invariants

- A derivation sees only the files in its `fileset`. When a build starts reading a new file or
  directory, add it there. Too few files fails the build; too many only rebuilds more often.
- Keep build commands as `pnpm` scripts that also work outside Nix. The derivation supplies the
  inputs and calls the script.
- Outputs mirror the repo layout (`packages/qwik/dist`, ...), so a consumer copies them over its
  checkout. Give a new output the path the build writes it to.
- `node_modules`, the dedupe check, the docs and insights builds, and the docs, CLI and Deno adapter
  e2e reach the network (`network = true`), which needs `sandbox = relaxed`. Keep everything else sandboxed, and
  never read a secret in a derivation.
- A new check gets a job by itself: the plan job lists every entry of `checks`. Only add workflow
  code for a platform without Nix.
- PR runs can write the shared cache, so every branch run builds its packages with `from-source`.
  Keep what a branch publishes to npm on the `artifact-dist` of its own run. PR previews
  (pkg.pr.new) download that artifact too, but on a PR run its packages can come from the shared
  cache. The docs site deploys `artifact-docs`: a run uploads it only when its docs differ from
  the last upload for that target, and builds it with the shared cache, on branch runs too.
- The builds leave `*.unit.*` files out of their sources so a test edit does not rebuild them. The
  `typecheck` check type-checks the ones that the qwik, router and root `tsconfig.json` include.

## Traps

- Flakes only see files that git tracks: `git add` a new file before `nix build`, or it is missing.
- An output that exists is never rebuilt. To rerun a passing check, use `nix build --rebuild`.
- A networked check runs outside the sandbox and shares the machine's ports. CI gives each check its
  own runner; locally, build those one at a time.
- The sandbox has no fonts, no outside network and no `GITHUB_ACTIONS`; `nix/ci.nix` provides what
  the browser tests need. A test that passes outside Nix and fails inside usually needs one of these.
- A version stamp is an input: the `dev` and `latest` flavors under `.#ci.<flavor>` share nothing
  past `node_modules` and the optimizer bindings.
- `nix build --keep-failed` keeps the build directory of a failed check, with its `test-results`.

## Stop Conditions

- Stop before giving a derivation network access to make a build pass; find the input it lacks.
- Stop before widening workflow `permissions`, or letting a PR-triggered job write somewhere a
  release reads from.
