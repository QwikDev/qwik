# Qwik v2 AI Agent Rules

> Canonical source for repo-wide AI coding agent rules. For contributor setup, see
> [CONTRIBUTING.md](./CONTRIBUTING.md). For package-specific workflows, load the relevant
> `.ruler/skills/*/SKILL.md` file.

## Source Of Truth

- Shared AI guidance lives in `.ruler/`; generated assistant outputs are local artifacts.
- Do not hand-edit or commit generated outputs such as root `AGENTS.md`, root `CLAUDE.md`,
  `.codex/`, `.claude/`, `.cursor/`, or generated skill directories.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`, or
  `.ruler/rules/**` / `.ruler/skills/**`, then regenerate with Ruler when needed.
- When building config for a specific AI tool, research that tool's current native guidance, skill,
  config, and policy surfaces before adding output-specific instructions.
- Map `.ruler` sources by semantic role: Markdown guidance to native AI guidance, skills to native
  skills when supported, MCP/config to native config, and command-permission policy only to a
  separately researched policy format.

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

Install dependencies with:

```bash
pnpm install
```

## Command Rules

- Prefer focused commands over repo-wide commands.
- Unit/spec tests: use `pnpm vitest run <path>`.
- Never use `pnpm test.unit` for agent verification in this repo; it is too broad.
- Do not run full `pnpm test` unless the user explicitly asks.
- Use `pnpm build.core.dev` for fast Qwik + Router rebuilds during most framework work.
- Use `pnpm build.local` for a fresh full local build without rebuilding Rust.
- Use `pnpm build.full` only when Rust/optimizer changes require it.
- Run `pnpm api.update` after public API changes.
- Run `pnpm lint` only when the change scope justifies broad linting; otherwise prefer focused
  tests and formatting checks.

Common focused commands:

```bash
pnpm build.core.dev
pnpm vitest run packages/qwik/src/core/tests/use-task.spec.tsx
pnpm playwright test e2e/qwik-e2e/tests/events.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
pnpm tsc.check
pnpm api.update
```

For Qwik e2e tests, use `--browser=chromium` with `e2e/qwik-e2e/playwright.config.ts`; do not use
`--project chromium` with that config.

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
  maintainer explicitly says the change is non-release-affecting.
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
