# Ruler Setup

This project uses [Ruler](https://github.com/intellectronica/ruler) to keep AI assistant instructions in one committed source of truth.

## Source Of Truth

```
.ruler/
├── AGENTS.md      # Project instructions for AI agents
├── native/        # Assistant-native files Ruler does not generate
├── rules/         # Always-on source rules propagated by Ruler
├── skills/        # Shared source skills propagated by Ruler
└── ruler.toml     # Ruler agent configuration
```

Use `.ruler/AGENTS.md` for short, always-on repository context and source-rule pointers. Use
`.ruler/rules/` for dedicated always-on rules. Use `.ruler/skills/` for task-specific workflows that
should be loaded only when relevant. Use `.ruler/native/<agent>/` for researched assistant-native
files that Ruler does not generate, such as command execution policy.

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

Generated assistant files such as `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, and `.cursor/`
are local outputs from Ruler and should not be edited directly or committed. Update the files in
`.ruler/`, then regenerate the local assistant files you need.

## AI Config Builder

Treat Ruler as the source layer and the selected assistant as the output layer.

When you are setting up or debugging an assistant-specific config:

1. Identify the target assistant and Ruler agent id.
2. Read this file and `.ruler/ruler.toml`.
3. Research the target assistant's current native instruction, rule, skill, config, and policy
   formats when the mapping is ambiguous.
4. Map `.ruler` files by semantic role, not by filename.
5. Run `ruler apply --agents <agent>`.
6. Copy any matching `.ruler/native/<agent>/` files into the assistant's native config directory.
7. Verify that the generated files contain the expected source guidance, skills, and native extras.

| Ruler source | Semantic role | Builder action |
| --- | --- | --- |
| `.ruler/AGENTS.md` | Short repo-wide AI guidance | Generate into the target assistant's primary native guidance file. |
| `.ruler/rules/*.md` | Dedicated always-on AI guidance | Generate into the target assistant's native guidance or rules surface with source markers. |
| `.ruler/skills/*/SKILL.md` | Task-triggered workflows | Copy to the target assistant's native skills directory when supported. |
| `.ruler/ruler.toml` and Ruler MCP config | Agent selection, output paths, MCP/config | Generate or merge native config only where Ruler and the target assistant support it. |
| `.ruler/native/<agent>/**` | Researched assistant-native extras | Copy to the target assistant's native directory after Ruler, preserving the documented native format. |
| `.ruler/native/<agent>/rules/*.rules` | Command permission policy when that assistant uses `.rules` for execution policy | Copy only after researching the target assistant's current policy format; do not derive it from prose guidance. |

Different tools use words like "rules" for different things. A native rules file may mean
natural-language guidance, directory-scoped steering, MCP config, hooks, or command execution
policy. Check current docs or the installed Ruler adapter before creating or copying a tool-specific
file.

### Worked Example: Codex

Current Ruler and OpenAI Codex behavior maps this repo's sources as follows:

| Ruler source | Codex-native output | Verify after `ruler apply --agents codex` |
| --- | --- | --- |
| `.ruler/AGENTS.md` | Generated root `AGENTS.md` | `rg -n 'Source: .ruler/AGENTS.md' AGENTS.md` |
| `.ruler/rules/*.md` | Generated root `AGENTS.md` with source comments | `rg -n 'Source: .ruler/rules' AGENTS.md` |
| `.ruler/skills/*/SKILL.md` | `.codex/skills/*/SKILL.md` | `find .codex/skills -name SKILL.md` |
| Ruler MCP config | `.codex/config.toml` when MCP config is generated | `test -f .codex/config.toml` when MCP/config is expected |
| `.ruler/native/codex/rules/*.rules` | `.codex/rules/*.rules` | `codex execpolicy check --rules .codex/rules/default.rules -- git status` when the installed Codex supports `execpolicy` |

Codex `.rules` files are command execution policy files that use `prefix_rule(...)`. They are not a
target for `.ruler/rules/*.md` prose guidance. Maintain Codex policy separately under
`.ruler/native/codex/rules/`.

Expected Codex check:

```bash
ruler apply --agents codex
mkdir -p .codex/rules
cp .ruler/native/codex/rules/*.rules .codex/rules/
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
test -f .codex/rules/default.rules
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
package-specific or workflow-specific guidance. Edit `.ruler/native/<agent>/**` for researched
assistant-native files that Ruler does not generate.

If a code task proves a skill or reference stale, update that guidance as part of the same task when
the scope allows it.

Then regenerate the local assistant files:

```bash
ruler apply --agents <your-tool>
```

Do not update generated files like `CLAUDE.md` or `AGENTS.md` by hand. They will be overwritten the
next time Ruler runs.

## Skills

Author shared skills under `.ruler/skills/`. Ruler copies them to each supported agent's generated
skill directory, including `.codex/skills/` for Codex, `.claude/skills/` for Claude, and
`.cursor/skills/` for Cursor.

Do not commit generated skill directories such as `.codex/skills/`, `.claude/skills/`, or
`.cursor/skills/`.

Keep each skill focused:

- Use frontmatter with `name` and a trigger-oriented `description`.
- Put the fast path in `SKILL.md`.
- Move long notes into `references/` only when progressive disclosure helps.
- Keep always-on policy in `.ruler/AGENTS.md`, not duplicated in every skill.
- Keep durable maintainer lessons current. Prefer updating the specific skill/reference that was
  wrong over adding broad prose here.
