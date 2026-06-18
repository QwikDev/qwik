

<!-- Source: .ruler/AGENTS.md -->

# Qwik v2 AI Agent Rules

> Canonical source for repo-wide AI coding agent rules. For contributor setup, see
> [CONTRIBUTING.md](./CONTRIBUTING.md). For package-specific workflows, load the relevant
> `.ruler/skills/*/SKILL.md` file.

## Source Of Truth

- Shared AI guidance lives in `.ruler/`. The generated `AGENTS.md`, `CLAUDE.md`, and skill
  directories are committed so a fresh clone or worktree has guidance immediately.
- Never hand-edit a generated output — edit `.ruler/` and regenerate with `ruler apply`. A CI check
  re-runs it and fails on drift.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`, or
  `.ruler/rules/**` / `.ruler/skills/**`, then regenerate with Ruler when needed.
- When building config for a specific AI tool, research that tool's current native guidance, skill,
  config, and policy surfaces before adding output-specific instructions.
- Map `.ruler` sources by semantic role: Markdown guidance to native AI guidance, skills to native
  skills when supported, MCP/config to native config, and command-permission policy only to a
  separately researched native policy format outside the Markdown guidance bundle.

## Project Snapshot

Qwik is a resumable web framework. SSR serializes application and framework state into HTML, and
the client resumes without re-running component code. Qwik v2 is a rewrite with VNode-based
runtime work, rewritten reactive primitives, a new serialization mechanism, and package names under
`@qwik.dev/*`.

Key concepts: resumability, QRLs, `$`-suffixed optimizer boundaries, fine-grained signals, VNodes,
the cursor system, and the Rust optimizer.

## Monorepo Map

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

## Environment

- Node: `>=22.18.0`
- pnpm: `>=10.14.0`
- Package manager: pnpm only

## Setup And Iteration Loop

This is the canonical loop for nearly all framework work. Default to it; do not substitute broader
commands:

```bash
# 1. Setup — once per checkout, and again after dependency changes
pnpm install

# 2. Fast dev build — required once before any tests can run, and again after framework
#    source changes when the verification consumes build output (all e2e suites do)
pnpm build.core.dev

# 3. Closest focused unit/spec test
pnpm vitest run packages/qwik/src/core/tests/use-task.spec.tsx

# 4. Focused e2e test
pnpm playwright test e2e/qwik-e2e/tests/events.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

`pnpm build.core.dev` is not optional: the Vitest config itself loads the built optimizer, and e2e
apps run against build output, so tests are only as fresh as the last build.

For Qwik e2e tests, use `--browser=chromium` with `e2e/qwik-e2e/playwright.config.ts`; do not use
`--project chromium` with that config.

## Command Rules

- Prefer focused commands over repo-wide commands.
- Unit/spec tests: use `pnpm vitest run <path>`.
- Never use `pnpm test.unit` for agent verification in this repo; it is too broad.
- Do not run full `pnpm test` unless the user explicitly asks.
- Use `pnpm build.core.dev` for fast Qwik + Router rebuilds during most framework work.
- Use `pnpm build.local` for a fresh full local build without rebuilding Rust.
- Use `pnpm build.full` only when Rust/optimizer changes require it.
- Run `pnpm tsc.check` for type-level verification when no focused test covers the change.
- Run `pnpm api.update` after public API changes.
- Run `pnpm lint` only when the change scope justifies broad linting; otherwise prefer focused
  tests and formatting checks.

## Source Rules

Dedicated source rules live under `.ruler/rules/` and are part of the always-on guidance generated
by Ruler.

- `test-driven-development`: write or update the closest focused test before behavior changes and
  bug fixes, then make the implementation pass it.
- `code-quality`: use understandable names, early returns over avoidable nesting, and focused
  modular helpers.
- `guidance-source-of-truth`: keep `.ruler` as the canonical guidance source, separate rules from
  skills, and map assistant outputs by semantic role.
- `generated-output-boundaries`: edit owning sources instead of generated artifacts and regenerate
  intentionally.
- `security-and-supply-chain`: run focused security reasoning for vulnerable surfaces, dependency
  changes, and GitHub Actions updates.
- `changeset-conventions`: pick the bump level by change kind (patch/minor/major), write one
  changeset per change, and keep each summary near 150 and under 300 characters.

## Engineering Rules

Recent Qwik v2 work by core maintainers favors small, behavior-shaped changes with regression proof.
Follow that bias:

- Start from the invariant that is broken, then find the producer and consumer that own it.
- Prefer local semantic helpers over broad rewrites when they make state, ordering, or ownership
  clearer.
- When changing a serialized, streamed, optimizer, loader, or hydration protocol, update both the
  writer and reader in the same change and add a round-trip or regression test.
- Preserve compatibility intentionally. If an old API path remains supported, cover it with a test
  and make the new path explicit.
- Add tests beside the behavior that changed: unit/spec for pure logic, e2e only for browser,
  streaming, navigation, or integration behavior.
- Do not leave debug logging, temporary names, "fixup" code, or unexplained broad fallbacks in the
  final diff.

## Guidance Freshness

- If a skill or reference you used is stale, incomplete, or contradicted by current source, update
  the `.ruler` source guidance before finishing the task unless the user explicitly restricted the
  scope.
- Keep new durable lessons in the most specific skill or reference that future agents are likely to
  load. Do not add package-specific details to these always-on rules unless they affect most tasks.
- When updating guidance, load the `qwik-guidance-maintenance` skill.

## Generated Files And Release Gates

- Follow the `generated-output-boundaries` rule before editing or relying on generated artifacts.
- If you change public API, run `pnpm api.update`.
- If you touch Rust optimizer code under `packages/optimizer/core/`, run the Rust/optimizer
  verification from the optimizer skill and use `pnpm build.full` when a full JS/WASM rebuild is
  required.
- If a change affects published packages, create a changeset with `pnpm change` unless the user or
  maintainer explicitly says the change is non-release-affecting. Follow the `changeset-conventions`
  rule for bump level, one changeset per change, and summary length.
- Base branch and release branch for v2 PRs: `build/v2`.

## Code Style

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

## Skill Selection

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

## Boundaries

- Preserve user work and unrelated changes. Do not reset or revert unrelated files.
- Keep edits scoped to the package, generated-file boundary, and verification surface implied by the
  task.
- Do not commit `.only` tests.
- Do not skip tests for behavior changes; use the closest focused test first.



<!-- Source: .ruler/README.md -->

# Ruler Setup

This project uses [Ruler](https://github.com/intellectronica/ruler) to keep AI assistant instructions in one committed source of truth.

## Source Of Truth

```
.ruler/
├── AGENTS.md      # Project instructions for AI agents
├── rules/         # Always-on source rules propagated by Ruler
├── skills/        # Shared source skills propagated by Ruler
└── ruler.toml     # Ruler agent configuration
```

Use `.ruler/AGENTS.md` for short, always-on repository context and source-rule pointers. Use
`.ruler/rules/` for dedicated always-on rules. Use `.ruler/skills/` for task-specific workflows that
should be loaded only when relevant.

Current source rules:

- `changeset-conventions`
- `code-quality`
- `generated-output-boundaries`
- `guidance-source-of-truth`
- `security-and-supply-chain`
- `test-driven-development`

Current source skills:

- `qwik-core-development`
- `qwik-router-development`
- `qwik-optimizer-development`
- `qwik-e2e-verification`
- `qwik-docs-development`
- `qwik-guidance-maintenance`

The `qwik-` prefix is intentional. Ruler copies skills into assistant-native directories where they
can appear beside personal and plugin skills, so the prefix keeps these repo skills recognizable
outside the `.ruler/` tree.

`AGENTS.md`, `CLAUDE.md`, and the skill directories are generated by Ruler but committed (so fresh
clones and worktrees have guidance immediately); the rest of `.claude/`/`.codex/`/`.cursor/` stays
local. Never edit a generated file directly — update `.ruler/`, run `ruler apply`, and commit the result.

## AI Config Builder

Treat Ruler as the source layer and the selected assistant as the output layer.

When you are setting up or debugging an assistant-specific config:

1. Identify the target assistant and Ruler agent id.
2. Read this file and `.ruler/ruler.toml`.
3. Research the target assistant's current native instruction, rule, skill, config, and policy
   formats when the mapping is ambiguous.
4. Map `.ruler` files by semantic role, not by filename.
5. Run `ruler apply --agents <agent>`.
6. Verify that the generated files contain the expected source guidance and skills.

| Ruler source | Semantic role | Builder action |
| --- | --- | --- |
| `.ruler/AGENTS.md` | Short repo-wide AI guidance | Generate into the target assistant's primary native guidance file. |
| `.ruler/rules/*.md` | Dedicated always-on AI guidance | Generate into the target assistant's native guidance or rules surface with source markers. |
| `.ruler/skills/*/SKILL.md` | Task-triggered workflows | Copy to the target assistant's native skills directory when supported. |
| `.ruler/ruler.toml` and Ruler MCP config | Agent selection, output paths, MCP/config | Generate or merge native config only where Ruler and the target assistant support it. |

Different tools use words like "rules" for different things. A native rules file may mean
natural-language guidance, directory-scoped steering, MCP config, hooks, or command execution
policy. Check current docs or the installed Ruler adapter before creating or copying a tool-specific
file.

## Markdown Guidance Bundle

The AI-agnostic Markdown guidance bundle is:

- `.ruler/AGENTS.md`
- every Markdown rule under `.ruler/rules/*.md`

Ruler concatenates that bundle and writes it to each selected assistant's native AI guidance file.
Use source markers in the generated file to verify inclusion. Do not bypass Ruler by copying these
Markdown files into a tool-specific directory whose format has not been verified.

If you are an AI assistant building local config for a target tool, research that tool's current
native guidance, skill, config, and policy formats before adding any tool-specific output. Map
`.ruler` files by what they mean, not by filename: Markdown guidance belongs in the assistant's
native AI guidance surface, skills belong in native skills if supported, and command-permission
policy belongs only in a separately researched policy format. For Codex, Ruler includes all
`.ruler` Markdown guidance in generated `AGENTS.md`; `.codex/rules/*.rules` is command policy, not
Markdown guidance.

### Worked Example: Codex

Current Ruler and OpenAI Codex behavior maps this repo's sources as follows:

| Ruler source | Codex-native output | Verify after `ruler apply --agents codex` |
| --- | --- | --- |
| `.ruler/AGENTS.md` | Generated root `AGENTS.md` | `rg -n 'Source: .ruler/AGENTS.md' AGENTS.md` |
| `.ruler/rules/*.md` | Generated root `AGENTS.md` with source comments | `rg -n 'Source: .ruler/rules' AGENTS.md` |
| `.ruler/skills/*/SKILL.md` | `.codex/skills/*/SKILL.md` | `find .codex/skills -name SKILL.md` |
| Ruler MCP config | `.codex/config.toml` when MCP config is generated | `test -f .codex/config.toml` when MCP/config is expected |

Codex `.rules` files are command execution policy files that use `prefix_rule(...)`. They are not a
target for `.ruler/rules/*.md` prose guidance. If Codex command policy is needed, maintain it as a
separate local or team policy using OpenAI Codex's `.rules` format; do not treat it as Ruler
Markdown guidance.

Expected Codex check:

```bash
ruler apply --agents codex
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
```

## Generated Assistant Files Are Committed

`AGENTS.md`, `CLAUDE.md`, and the skill directories (`.claude/skills/`, `.codex/skills/`) are
**committed**, not gitignored (`.ruler/ruler.toml` sets `[gitignore] enabled = false`). They are
still generated from `.ruler/` — committing them just means a fresh clone or worktree has the full
guidance immediately, with no install, network, or generation step.

To change guidance, edit `.ruler/`, run `ruler apply`, and commit the regenerated files alongside
your `.ruler/` change. Never hand-edit the generated files. A CI check (`.github/workflows/ruler-check.yml`)
re-runs `ruler apply` and fails if the committed outputs drift from `.ruler/`.

## Generate Local Assistant Files

Install Ruler if you do not already have it:

```bash
npm install -g @intellectronica/ruler
```

Generate files for the default configured agents:

```bash
ruler apply
```

Generate files for a specific assistant:

```bash
ruler apply --agents claude
ruler apply --agents codex
```

Generate files for multiple assistants:

```bash
ruler apply --agents claude,codex
```

## Project And Personal Configuration

Use `.ruler/` for team-shared instructions and project conventions that should travel with the repo.

Use `~/.config/ruler/` for personal preferences, local workflow shortcuts, API keys, and personal MCP servers:

```bash
ruler init --global
```

If it helps everyone working in this repo, add it to `.ruler/`. If it only helps your local setup,
keep it in your global Ruler config.

## Updating Instructions

Edit `.ruler/AGENTS.md` for repository-wide guidance. Edit `.ruler/rules/<rule-name>.md` for a
dedicated always-on rule. Edit the relevant `.ruler/skills/<skill-name>/SKILL.md` file for
package-specific or workflow-specific guidance.

If a code task proves a skill or reference stale, update that guidance as part of the same task when
the scope allows it.

Then regenerate the local assistant files:

```bash
ruler apply --agents <your-tool>
```

Do not update generated files like `CLAUDE.md` or `AGENTS.md` by hand. They will be overwritten the
next time Ruler runs.

## Skills

Author shared skills under `.ruler/skills/`. Ruler copies them into each enabled agent's skill
directory (`.claude/skills/` for Claude, `.codex/skills/` for Codex), which are committed alongside
the source so the skills are available in a fresh clone or worktree. Regenerate and commit them with
`ruler apply` after editing `.ruler/skills/`; never hand-edit the copies.

Keep each skill focused:

- Use frontmatter with `name` and a trigger-oriented `description`.
- Put the fast path in `SKILL.md`.
- Move long notes into `references/` only when progressive disclosure helps.
- Keep always-on policy in `.ruler/AGENTS.md`, not duplicated in every skill.
- Keep durable maintainer lessons current. Prefer updating the specific skill/reference that was
  wrong over adding broad prose here.



<!-- Source: .ruler/rules/changeset-conventions.md -->

# Changeset Conventions Rule

When a change affects published packages, write changesets with `pnpm change` (or by adding files
under `.changeset/`) using the bump level that matches the kind of change.

## Bump Level

- `patch`: bug fixes.
- `minor`: new features.
- `major`: API removal. A `major` may also include a new feature, but it must remove or break a
  public API.

## One Changeset Per Change

Create a separate changeset for each `patch`, `minor`, or `major` change. Do not combine unrelated
fixes and features into one changeset. If a single PR carries a bug fix and a new feature, write one
`patch` changeset and one `minor` changeset.

## Casing

Write the changeset summary in lowercase, including any leading type prefix such as `fix:` or
`feat:`. Do not uppercase the prefix or shout the summary.

## Length

Each changeset summary should aim for around 150 characters and must not exceed 300 characters.
Describe the user-facing change in one tight sentence; move deeper detail to the PR description.



<!-- Source: .ruler/rules/code-quality.md -->

# Code Quality Rule

Write code that junior developers and AI agents can understand during review and future changes.

## Naming

- Use names that explain the domain idea, not the implementation trick.
- Prefer specific names over short names when the value crosses more than a few lines.
- Name booleans as questions or states, such as `isReady`, `hasSubscribers`, or `shouldFlush`.
- Name functions by the action they perform, such as `resolveLoaderData()` or
  `markContainerReady()`.
- Avoid vague names like `data`, `item`, `temp`, `handle`, `process`, or `doWork` unless the local
  scope makes the meaning obvious.
- Keep existing public API names unless the task is intentionally changing the API.

## Control Flow

- Prefer early returns for invalid, empty, unsupported, or already-handled cases.
- Avoid deep nesting when a guard clause can make the main path easier to read.
- Keep the success path visible at the outer indentation level when possible.
- Do not use clever boolean expressions when a named condition or small helper would be clearer.
- Keep error and compatibility branches explicit so reviewers can see why they exist.

## Modularity

- Keep functions focused on one responsibility.
- Extract a helper when a block has a clear name, is reused, or hides the main path.
- Do not extract helpers only to move complexity around; the caller should become easier to read.
- Keep helpers close to their first use unless they are shared across files.
- Prefer local semantic helpers over broad abstractions.

## Review Standard

Before finishing, read the changed code as if you are new to the package:

1. Can a junior developer explain what each name represents?
2. Can an AI agent identify the main path without following deeply nested branches?
3. Are edge cases handled by clear guard clauses or named helpers?
4. Is the change modular without hiding important state or protocol boundaries?

If the answer is no, simplify the code before calling the task complete.



<!-- Source: .ruler/rules/generated-output-boundaries.md -->

# Generated Output Boundaries Rule

Edit source files, not generated artifacts. Generated files are evidence to regenerate or inspect,
not the place to make durable changes.

## Do Not Hand-Edit

Do not hand-edit generated outputs such as:

- root assistant outputs: `AGENTS.md`, `CLAUDE.md`, `.codex/`, `.claude/`, `.cursor/`
- package build output: `dist/`, `lib/`, `target/`
- public API markdown: `*.api.md`
- API metadata: `tsdoc-metadata.json`
- generated docs output under `packages/docs/dist/`

Edit the owning source or generator instead.

## Regenerate Intentionally

Run the narrowest generator or updater that owns the changed output:

- Public API changes: run `pnpm api.update`.
- Docs LLM output changes: run the docs generator or build from `packages/docs`.
- Optimizer build output changes: run the relevant optimizer build, such as `pnpm build.full`, when
  Rust/WASM output is expected to change.
- Optimizer fixture snapshots: update snapshots only when the transform behavior change is
  intentional and reviewed.
- Ruler assistant output: run a Ruler dry-run or local apply from `.ruler` source changes.

Use the relevant package skill for exact commands and suite-specific details.

## Review Standard

Before finishing a change that touches or depends on generated output:

1. Identify the source file or generator that owns the output.
2. Confirm whether the generated file should be regenerated, ignored, or left unchanged.
3. Run the narrowest relevant generator/check when the environment supports it.
4. Record any missing dependency, network, toolchain, or generated-artifact blocker.
5. Do not claim generated output verification from a source-only check unless that check covers the
   generated artifact.



<!-- Source: .ruler/rules/guidance-source-of-truth.md -->

# Guidance Source Of Truth Rule

Keep shared AI guidance in the committed `.ruler` source tree. Generated assistant files are local
outputs, not source.

## Source Layout

- Put short repo-wide context in `.ruler/AGENTS.md`.
- Put dedicated always-on rules in `.ruler/rules/<rule-name>.md`.
- Put task-specific workflows in `.ruler/skills/<skill-name>/SKILL.md`.
- Put long, conditional notes in a skill `references/` file only when progressive disclosure helps.
- Keep the `qwik-` prefix on committed Qwik skill names unless Ruler gains repo-scoped skill
  namespacing that makes the prefix redundant.

## Generated Assistant Outputs

- The generated `AGENTS.md`, `CLAUDE.md`, and skill directories are committed so a fresh clone or
  worktree has guidance immediately. Never hand-edit them — edit `.ruler/` and regenerate.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`,
  `.ruler/rules/**`, or `.ruler/skills/**`, then run `ruler apply` and commit the regenerated output.
- A CI check re-runs `ruler apply` and fails if the committed outputs drift from `.ruler/`.

## AI Config Builder

When building or debugging native AI tool config, map `.ruler` sources by semantic role:

- Markdown AI guidance: `.ruler/AGENTS.md` and `.ruler/rules/*.md`.
- Task skills: `.ruler/skills/**/SKILL.md` and any directly referenced local resources.
- Tool or MCP config: `.ruler/ruler.toml` plus Ruler MCP configuration.
- Command execution policy: only a separately researched native policy format, not prose guidance
  copied from `.ruler/rules/*.md`.

Before adding a target-specific output rule, research the selected tool's current official docs or
the installed Ruler adapter. Do not infer semantics from filenames alone. Terms like "rules" can
mean natural-language guidance for one assistant and command permission policy for another.

## Worked Example: Codex

For Codex with current Ruler and OpenAI docs:

- Ruler writes `.ruler/AGENTS.md` and `.ruler/rules/*.md` into generated root `AGENTS.md` with
  source comments such as `<!-- Source: .ruler/rules/... -->`.
- Ruler writes `.ruler/skills/**` to `.codex/skills/`.
- Ruler writes MCP settings to `.codex/config.toml` when MCP config is present.
- Codex `.rules` files are command execution policy, not natural-language project guidance.

Verify Codex AI guidance with:

```bash
ruler apply --agents codex
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
```

Do not translate Markdown guidance from `.ruler/rules/*.md` into Codex `.rules` files. Codex
command-policy files use a separate native format and should be handled separately from Ruler
Markdown guidance.

## Rule Versus Skill

Use `.ruler/rules/*.md` for durable policy that should be available without loading a task skill:

- source-of-truth and generated-output boundaries
- rule-vs-skill taxonomy
- engineering quality standards
- test and verification policy that applies across packages
- guidance freshness expectations

Use skills for package or workflow details:

- package source maps
- subsystem-specific invariants
- focused commands and examples
- stop conditions
- references that should load only for relevant tasks

## Guidance Freshness

When current source contradicts loaded guidance, update the narrowest `.ruler` source that was
wrong. Prefer replacing stale text over appending another long note. Do not encode one-off branch
facts, temporary debugging notes, or speculative design as durable guidance.



<!-- Source: .ruler/rules/no-hydration-terminology.md -->

# No Hydration Terminology Rule

Never describe Qwik or any part of how Qwik works as hydration. Qwik does not hydrate. Qwik is
resumable: the server serializes application state and listeners into the HTML, and the client
resumes execution exactly where the server left off, without re-running component code or
rebuilding the framework state.

## Why This Rule Exists

Generated documentation has repeatedly described Qwik using hydration terminology. This is
factually wrong and undermines Qwik's core value proposition. Hydration means re-executing
component code on the client to reconstruct framework state that the server already had.
Qwik's entire design exists to avoid that work.

## When Writing Documentation

- Do not call any Qwik mechanism "hydration", "hydrating", "rehydration", "partial hydration",
  "progressive hydration", "selective hydration", or "island hydration".
- Do not describe Qwik components, containers, or apps as "hydrated" or "needing to hydrate".
- Use the correct terms instead: "resumability", "resume", "resuming", "serialization",
  "deserialization", and "lazy execution".
- Describe client startup as Qwik resuming from serialized state, not as Qwik booting, mounting,
  or hydrating the app.

## Allowed Mentions

The word "hydration" may appear only when explicitly contrasting Qwik with hydration-based
frameworks, and the sentence must make clear that hydration is what other frameworks do and what
Qwik avoids. For example: "Unlike frameworks that hydrate on the client, Qwik resumes from
serialized state." Never use hydration vocabulary, even casually or by analogy, to explain what
Qwik itself does.



<!-- Source: .ruler/rules/security-and-supply-chain.md -->

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



<!-- Source: .ruler/rules/test-driven-development.md -->

# Test Driven Development Rule

Use test-driven development for behavior changes and bug fixes.

## Required Workflow

1. Identify the observable behavior or invariant before editing implementation code.
2. Add or update the closest focused test that proves the behavior.
3. Run that test before the implementation change when feasible and confirm it fails for the
   expected reason.
4. Make the smallest implementation change that satisfies the test.
5. Rerun the focused test and keep iterating until it passes.
6. Run any broader verification required by the touched surface, such as API docs, optimizer
   snapshots, build output, or e2e coverage.

## Test Selection

- Prefer unit/spec tests next to the changed code.
- Use optimizer fixtures and snapshots for Rust transform behavior.
- Use e2e tests only when the behavior depends on a real browser, navigation, streaming, SSR/CSR
  integration, adapter behavior, or fixture app wiring.
- For serialization, hydration, streaming, or loader protocol changes, test both the writer and the
  reader path.
- For compatibility behavior, test both the current API path and the supported deprecated path.

## Exceptions

Docs-only, rules-only, formatting-only, dependency metadata, and generated-output maintenance
changes do not need a failing product test first. They still need the narrowest relevant
verification, such as formatting, Ruler dry-run, generated-output checks, or docs build checks.

If dependencies, missing generated artifacts, or local environment constraints prevent a pre-fix
test run, write the focused test first, record the blocker, and run the test as soon as the blocker
is resolved.
