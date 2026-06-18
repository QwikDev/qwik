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
