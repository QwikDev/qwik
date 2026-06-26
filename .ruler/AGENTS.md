# Qwik v2 agents reference, instructions and rules

> Canonical source for repo-wide AI coding agent rules. For contributor setup, see
> [CONTRIBUTING.md](./CONTRIBUTING.md). For package-specific workflows, load the relevant
> `.ruler/skills/*/SKILL.md` file.

## Source Of Truth

- Shared AI guidance lives in `.ruler/`.
- Never hand-edit a generated output — edit `.ruler/` and regenerate with `ruler apply`. A CI check
  re-runs it and fails on drift.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`, or `.ruler/skills/**`,
  then regenerate with Ruler when needed.

## Project Snapshot

Qwik is a resumable web framework. SSR serializes application and framework state into HTML, and
the client resumes without re-running component code. Qwik v2 is a rewrite with VNode-based
runtime work, rewritten reactive primitives, a new serialization mechanism, and package names under
`@qwik.dev/*`.

Key concepts: resumability, QRLs, `$`-suffixed optimizer boundaries, fine-grained signals, VNodes,
the cursor system, and the Rust optimizer.

## Monorepo Map

- Base branch and release branch for v2 PRs: `build/v2`.

| Package | Path | Notes |
| --- | --- | --- |
| `@qwik.dev/core` | `packages/qwik` | Core runtime, SSR, optimizer-facing code |
| `@qwik.dev/router` | `packages/qwik-router` | Routing, middleware, adapters, SSG |
| `@qwik.dev/react` | `packages/qwik-react` | React integration |
| `@qwik.dev/dom` | `packages/qwik-dom` | Server-side DOM implementation |
| `@qwik.dev/optimizer` | `packages/optimizer` | Rust optimizer, WASM, NAPI bindings |
| `eslint-plugin-qwik` | `packages/eslint-plugin-qwik` | ESLint rules |
| `create-qwik` | `packages/create-qwik` | Project scaffolding CLI |
| `qwik-docs` | `packages/docs` | Docs site, private package |
| `insights` | `packages/insights` | Analytics dashboard, private package |

Use v2 package names (`@qwik.dev/core`, `@qwik.dev/router`, etc.). Do not introduce v1
`@builder.io/qwik` or `@builder.io/qwik-city` imports except when working on explicit
compatibility override code.

## Setup And Iteration Loop

This is the canonical loop for nearly all framework work. Default to it; do not substitute broader
commands:

### getting started

```bash
# Setup — once per checkout, and again after dependency changes
pnpm install && pnpm build.core
```
### Iterating

Prefer focused commands and builds over repo-wide commands and builds.

```bash
# Fast dev build — required once before any tests can run, and again after framework
# source changes when the verification consumes build output (all e2e suites do)
pnpm build.core.dev

# Closest focused unit/spec test
pnpm vitest run packages/qwik/src/core/tests/use-task.spec.tsx

# Focused e2e test
pnpm playwright test e2e/qwik-e2e/tests/events.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

`build.core.dev` also re-emits fresh Qwik and Router `.d.ts` incrementally (via `tscDevDts` + re-export shims), so editing a public signature no longer leaves stale types — `build.watch` skips the type pass to stay instant.

For Qwik e2e tests, use `--browser=chromium` with `e2e/qwik-e2e/playwright.config.ts`.

Run `pnpm build.full` only when you are touching the optimizer rust code.

### When making a PR

```bash
# for type-level verification when no focused test covers the change
pnpm tsc.check

# update the API
pnpm api.update

# Verify the build passes
pnpm build.core

# Verify unit tests pass
pnpm test.unit

# Verify the E2Es pass
pnpm test.e2e.chromium

# In case of html output change, update the ssg snapshot
pnpm test.e2e.router.ssg.update

# In case of a new feature, run the test.bench
pnpm test.bench

# In case of qwikloader changes
pnpm vitest packages/qwik/src/qwikloader.unit.ts -u
```

If any of those fail, fix and push your changes.

## Rules

Recent Qwik v2 work by core maintainers favors small, behavior-shaped changes with regression proof.
Follow that bias:

### Guidance Freshness

- If a skill or reference you used is stale, incomplete, or contradicted by current source, update
  the `.ruler` source guidance before finishing the task unless the user explicitly restricted the
  scope.
- Keep new durable lessons in the most specific skill or reference that future agents are likely to
  load. Do not add package-specific details to these always-on rules unless they affect most tasks.
- Write those notes **prescriptively** — the invariants to keep, the traps that cause false passes,
  where things live, and how to verify — rather than describing how the code currently works (the
  source already does that). Omit "don't do X" prohibitions for anything a test already enforces; the
  suite is the guardrail, so reserve notes for what it can't self-enforce.
- When updating guidance, load the `qwik-guidance-maintenance` skill.

### Code Style

Prettier and ESLint define style. Keep semicolons, single quotes, two-space indentation, trailing
commas where configured, and always use braces for control flow.

Naming conventions:

| Pattern | Usage |
| --- | --- |
| `use*` | Hooks called in component/task scope |
| `*$` | QRL boundary extracted by the optimizer |
| `create*` | Factory functions |
| `*.unit.ts(x)` | Vitest unit files |
| `*.spec.ts(x)` | Vitest spec files |
| `*.e2e.ts` | Playwright e2e files |

### Skill Selection

Load the relevant skill before non-trivial work in that area:

| Skill | Use when |
| --- | --- |
| `qwik-core-development` | Editing/reviewing `packages/qwik/**` core runtime code |
| `qwik-router-development` | Editing/reviewing router runtime, buildtime, middleware, adapters, or SSG |
| `qwik-optimizer-development` | Editing/reviewing Rust optimizer, WASM, NAPI, or optimizer-facing behavior |
| `qwik-e2e-verification` | Creating, debugging, or running Playwright e2e suites |
| `qwik-docs-development` | Writing/editing docs content, docs site routes, or docs LLM outputs |
| `qwik-guidance-maintenance` | Editing `.ruler/**`, generated-output guidance, or stale skill/reference content |

If no skill fits, stay with these repo-wide rules and inspect local source before changing code.

Keep the `qwik-` prefix on committed source skill names. Ruler copies these skills into
agent-native skill directories where they may coexist with user or plugin skills, so the prefix keeps
the skill list unambiguous outside the repo-local `.ruler` tree.

### Changesets

When a change affects published packages, add a changeset under `.changeset/`.

- Use `patch` for bug fixes, `minor` for new features and `major` for API removal. A `major` may also include a new feature, but it must remove or break a public API. 
- Enforce 1 changeset per change.
- Write the changeset summary in lowercase (e.g. `fix:`)
- 1 sentence focused on the bug fix or feature. Don't include implementation details.

### Code Quality

Write code that junior developers and AI agents can understand during review and future changes.

#### Sanity

- Prefer local semantic helpers over broad rewrites when they make state, ordering, or ownership
  clearer.
- Do not leave debug logging, temporary names, "fixup" code, or unexplained broad fallbacks in the
  final diff.
- Only add explanatory comments where absolutely necessary, only to warn and crucial information that is not self-explanatory. Write comments for humans: keep your comments constrained to 1 short sentence or 2 maximum; be mindful of character count; focus on explaning the crux of the issue rather than implementation details.  
- Write one changeset per patch/minor/major change. Keep the changeset message constrained to 1 short sentence or 2 maximum, focused on the bug fix, feature or breaking changes. Don't explain the internals or implementation details.

#### Naming

- Use names that explain the domain idea, not the implementation trick.
- Prefer specific names over short names when the value crosses more than a few lines.
- Name booleans as questions or states, such as `isReady`, `hasSubscribers`, or `shouldFlush`.
- Name functions by the action they perform, such as `resolveLoaderData()` or
  `markContainerReady()`.
- Avoid vague names like `data`, `item`, `temp`, `handle`, `process`, or `doWork` unless the local
  scope makes the meaning obvious.
- Keep existing public API names unless the task is intentionally changing the API.

#### Control Flow

- Prefer early returns for invalid, empty, unsupported, or already-handled cases.
- Avoid deep nesting when a guard clause can make the main path easier to read.
- Keep the success path visible at the outer indentation level when possible.
- Do not use clever boolean expressions when a named condition or small helper would be clearer.
- Keep error and compatibility branches explicit so reviewers can see why they exist.

#### Modularity

- Keep functions focused on one responsibility.
- Extract a helper when a block has a clear name, is reused, or hides the main path.
- Do not extract helpers only to move complexity around; the caller should become easier to read.
- Keep helpers close to their first use unless they are shared across files.
- Prefer local semantic helpers over broad abstractions.

#### Review Standard

Before finishing, read the changed code as if you are new to the package:

1. Can a junior developer explain what each name represents?
2. Can an AI agent identify the main path without following deeply nested branches?
3. Are edge cases handled by clear guard clauses or named helpers?
4. Is the change modular without hiding important state or protocol boundaries?

If the answer is no, simplify the code before calling the task complete.

### No Hydration Terminology

Never describe Qwik or any part of how Qwik works as hydration. Qwik does not hydrate. Qwik is
resumable: the server serializes application state and listeners into the HTML, and the client
resumes execution exactly where the server left off, without re-running component code or
rebuilding the framework state.

- Do not call any Qwik mechanism "hydration", "hydrating", "rehydration", "partial hydration",
  "progressive hydration", "selective hydration", or "island hydration".
- Do not describe Qwik components, containers, or apps as "hydrated" or "needing to hydrate".
- Use the Qwik terminilogy instead: "javascript streaming", "JIT preloading", "resumability", "resume", "resuming", "serialization", "deserialization", and "lazy execution".
- Describe client startup as Qwik resuming from serialized state, not as Qwik booting, mounting,
  or hydrating the app.

#### Allowed Mentions

The word "hydration" may appear only when explicitly contrasting Qwik with hydration-based
frameworks, and the sentence must make clear that hydration is what other frameworks do and what
Qwik avoids. For example: "Unlike frameworks that hydrate on the client, Qwik resumes from
serialized state." Never use hydration vocabulary, even casually or by analogy, to explain what
Qwik itself does.

### Security And Supply Chain

Treat security-sensitive changes as behavior changes even when they look like config, dependency,
or CI maintenance.

#### Security Review Trigger

Pause for a focused security pass when a change touches:

- authentication, authorization, sessions, cookies, redirects, URL parsing, filesystem paths, SSR,
  serialization, HTML/script output, request handling, or server adapters
- dependency versions, lockfiles, package manager settings, release scripts, publishing scripts, or
  build tooling
- GitHub Actions, reusable workflows, workflow permissions, tokens, secrets, cache keys, artifact
  upload/download, or deployment credentials

Use the changed diff as the starting point. Check directly supporting files when needed, but do not
turn a small change into a repository-wide security scan unless the user asks.

#### What To Check

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

#### GitHub Actions

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

#### Verification

For security-sensitive changes, record the focused security reasoning in the final response:

1. What boundary changed?
2. What guard or invariant prevents abuse?
3. What focused test, lint, config check, or manual inspection covered it?

If you cannot verify the security property locally, say exactly what remains unverified.

### Test Driven Development

Use test-driven development for behavior changes and bug fixes.

#### Required Workflow

1. Identify the observable behavior or invariant before editing implementation code.
2. Add or update the closest focused test that proves the behavior.
3. Run that test before the implementation change when feasible and confirm it fails for the
   expected reason.
4. Make the smallest implementation change that satisfies the test.
5. Rerun the focused test and keep iterating until it passes.
6. Run any broader verification required by the touched surface, such as API docs, optimizer
   snapshots, build output, or e2e coverage.

#### Test Selection

- Prefer unit/spec tests next to the changed code.
- Use optimizer fixtures and snapshots for Rust transform behavior.
- Use e2e tests only when the behavior depends on a real browser, navigation, streaming, SSR/CSR
  integration, adapter behavior, or fixture app wiring.
- For serialization, hydration, streaming, or loader protocol changes, test both the writer and the
  reader path.
- For compatibility behavior, test both the current API path and the supported deprecated path.

#### Exceptions

Docs-only, rules-only, formatting-only, dependency metadata, and generated-output maintenance
changes do not need a failing product test first. They still need the narrowest relevant
verification, such as formatting, Ruler dry-run, generated-output checks, or docs build checks.

If dependencies, missing generated artifacts, or local environment constraints prevent a pre-fix
test run, write the focused test first, record the blocker, and run the test as soon as the blocker
is resolved.

### Boundaries

- Preserve user work and unrelated changes. Do not reset or revert unrelated files.
- Keep edits scoped to the package, generated-file boundary, and verification surface implied by the
  task.
- Do not commit `.only` tests.
- Do not skip tests for behavior changes; use the closest focused test first.
