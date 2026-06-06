# Security And Supply Chain Rule

Treat security-sensitive changes as behavior changes even when they look like config, dependency,
or CI maintenance.

## Security Review Trigger

Pause for a focused security pass when a change touches:

- authentication, authorization, sessions, cookies, redirects, URL parsing, filesystem paths, SSR,
  serialization, HTML/script output, request handling, or server adapters
- dependency versions, lockfiles, package manager settings, release scripts, publishing scripts, or
  build tooling
- GitHub Actions, reusable workflows, workflow permissions, tokens, secrets, cache keys, artifact
  upload/download, or deployment credentials

Use the changed diff as the starting point. Check directly supporting files when needed, but do not
turn a small change into a repository-wide security scan unless the user asks.

## What To Check

- Identify the trust boundary: attacker-controlled input, untrusted dependency code, untrusted CI
  event data, secrets, tokens, publish credentials, or generated output.
- Find the closest existing guard and the sink it protects. Do not claim safety from a broad
  intuition; point to the concrete validation, escaping, permission, or isolation boundary.
- Prefer fail-closed behavior for malformed input, unknown modes, unsupported hosts, and missing
  config.
- Keep secrets out of logs, snapshots, artifacts, caches, generated files, browser output, and error
  messages.
- When changing dependencies or build tools, check for new install scripts, binary downloads,
  network fetches, transitive tool execution, license or provenance surprises, and lockfile drift.

## GitHub Actions

When editing `.github/workflows/**` or action-related scripts:

- Keep `permissions:` least-privilege at the workflow or job level.
- Do not introduce `pull_request_target` for code checkout/build/test of untrusted PR content unless
  the workflow is explicitly designed to avoid running attacker-controlled code with secrets.
- Avoid passing secrets to forked PRs, third-party actions, shell commands that print env, or
  generated artifacts.
- Prefer trusted first-party actions. For new third-party actions, pin to a full commit SHA or
  document why a moving tag is acceptable.
- Treat cache restore keys and artifact paths as untrusted input surfaces. Avoid broad paths that can
  poison future jobs or expose credentials.
- Quote shell variables and avoid `eval`, curl-piped shells, and unchecked interpolation of GitHub
  context values into shell commands.

## Verification

For security-sensitive changes, record the focused security reasoning in the final response:

1. What boundary changed?
2. What guard or invariant prevents abuse?
3. What focused test, lint, config check, or manual inspection covered it?

If you cannot verify the security property locally, say exactly what remains unverified.
