# Ruler Setup

This project uses [Ruler](https://github.com/intellectronica/ruler) to keep AI assistant instructions in one committed source of truth.

## Source of Truth

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

- `code-quality`
- `generated-output-boundaries`
- `guidance-source-of-truth`
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

Generated assistant files such as `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, and `.cursor/` are local outputs from Ruler and should not be edited directly or committed. Update the files in `.ruler/`, then regenerate the local assistant files you need.

## Assistant Translation

Ruler is the source layer. Each assistant has its own output shape.

| Ruler source | Meaning | Codex output | Verify after `ruler apply --agents codex` |
| --- | --- | --- | --- |
| `.ruler/AGENTS.md` | Short repo-wide context and rule index | Concatenated into generated root `AGENTS.md` | `rg -n 'Source: .ruler/AGENTS.md' AGENTS.md` |
| `.ruler/rules/*.md` | Dedicated always-on rules | Concatenated into generated root `AGENTS.md` with source comments | `rg -n 'Source: .ruler/rules' AGENTS.md` |
| `.ruler/skills/*/SKILL.md` | Task-triggered workflows | Copied to `.codex/skills/*/SKILL.md` | `find .codex/skills -name SKILL.md` |
| `.ruler/ruler.toml` and Ruler MCP config | Agent config and MCP output settings | `.codex/config.toml` when Codex config is generated | `test -f .codex/config.toml` when MCP/config is expected |

Codex project rules are `AGENTS.md`. Ruler does not generate a `.codex/rules/` directory for this
repo. If Codex adds a separate repo rules format later, update this table and
`.ruler/rules/guidance-source-of-truth.md` before adding a custom conversion layer.

Expected Codex check:

```bash
ruler apply --agents codex
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
```

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
ruler apply --agents cursor
ruler apply --agents copilot
```

Generate files for multiple assistants:

```bash
ruler apply --agents claude,cursor
```

## Project and Personal Configuration

Use `.ruler/` for team-shared instructions and project conventions that should travel with the repo.

Use `~/.config/ruler/` for personal preferences, local workflow shortcuts, API keys, and personal MCP servers:

```bash
ruler init --global
```

If it helps everyone working in this repo, add it to `.ruler/`. If it only helps your local setup, keep it in your global Ruler config.

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

Do not update generated files like `CLAUDE.md` or `AGENTS.md` by hand. They will be overwritten the next time Ruler runs.

## Skills

Author shared skills under `.ruler/skills/`. Ruler copies them to each supported agent's generated skill directory, including `.codex/skills/` for Codex, `.claude/skills/` for Claude, and `.cursor/skills/` for Cursor.

Do not commit generated skill directories such as `.codex/skills/`, `.claude/skills/`, or `.cursor/skills/`.

Keep each skill focused:

- Use frontmatter with `name` and a trigger-oriented `description`.
- Put the fast path in `SKILL.md`.
- Move long notes into `references/` only when progressive disclosure helps.
- Keep always-on policy in `.ruler/AGENTS.md`, not duplicated in every skill.
- Keep durable maintainer lessons current. Prefer updating the specific skill/reference that was
  wrong over adding broad prose here.
