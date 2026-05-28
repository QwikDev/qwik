# Ruler Setup

This project uses [Ruler](https://github.com/intellectronica/ruler) to keep AI assistant instructions in one committed source of truth.

## Source of Truth

```
.ruler/
├── AGENTS.md      # Project instructions for AI agents
├── skills/        # Shared source skills propagated by Ruler
└── ruler.toml     # Ruler agent configuration
```

Package-specific long-form guidance should live as a focused skill under `.ruler/skills/`. For example, Qwik core guidance lives in `.ruler/skills/qwik-core-development/SKILL.md`.

Generated assistant files such as `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, and `.cursor/` are local outputs from Ruler and should not be edited directly or committed. Update the files in `.ruler/`, then regenerate the local assistant files you need.

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

Edit `.ruler/AGENTS.md` for repository-wide guidance. Edit `.ruler/skills/qwik-core-development/SKILL.md` for Qwik core package-specific guidance.

Then regenerate the local assistant files:

```bash
ruler apply --agents <your-tool>
```

Do not update generated files like `CLAUDE.md` or `AGENTS.md` by hand. They will be overwritten the next time Ruler runs.

## Skills

Author shared skills under `.ruler/skills/`. Ruler copies them to each supported agent's generated skill directory, including `.codex/skills/` for Codex, `.claude/skills/` for Claude, and `.cursor/skills/` for Cursor.

Do not commit generated skill directories such as `.codex/skills/`, `.claude/skills/`, or `.cursor/skills/`.
