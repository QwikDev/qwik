# Guidance Source Of Truth Rule

Keep shared AI guidance in the committed `.ruler` source tree. Generated assistant files are local
outputs, not source.

## Source Layout

- Put short repo-wide context in `.ruler/AGENTS.md`.
- Put dedicated always-on rules in `.ruler/rules/<rule-name>.md`.
- Put task-specific workflows in `.ruler/skills/<skill-name>/SKILL.md`.
- Put researched assistant-native files that Ruler does not generate in `.ruler/native/<agent>/`.
- Put long, conditional notes in a skill `references/` file only when progressive disclosure helps.
- Keep the `qwik-` prefix on committed Qwik skill names unless Ruler gains repo-scoped skill
  namespacing that makes the prefix redundant.

## Generated Assistant Outputs

- Do not hand-edit or commit generated assistant outputs such as root `AGENTS.md`, root `CLAUDE.md`,
  `.codex/`, `.claude/`, `.cursor/`, or generated skill directories.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`,
  `.ruler/rules/**`, `.ruler/skills/**`, or `.ruler/native/**`.
- Regenerate local assistant outputs with Ruler only when needed for verification or local use.

## AI Config Builder

When building or debugging native AI tool config, map `.ruler` sources by semantic role:

- Markdown AI guidance: `.ruler/AGENTS.md` and `.ruler/rules/*.md`.
- Task skills: `.ruler/skills/**/SKILL.md` and any directly referenced local resources.
- Tool or MCP config: `.ruler/ruler.toml` plus Ruler MCP configuration.
- Assistant-native extras that Ruler does not generate: `.ruler/native/<agent>/**`.
- Command execution policy: only a separately researched native policy source under
  `.ruler/native/<agent>/`, not prose guidance copied from `.ruler/rules/*.md`.

Before adding a target-specific output rule, research the selected tool's current official docs or
the installed Ruler adapter. Do not infer semantics from filenames alone. Terms like "rules" can
mean natural-language guidance for one assistant and command permission policy for another.

## Worked Example: Codex

For Codex with current Ruler and OpenAI docs:

- Ruler writes `.ruler/AGENTS.md` and `.ruler/rules/*.md` into generated root `AGENTS.md` with
  source comments such as `<!-- Source: .ruler/rules/... -->`.
- Ruler writes `.ruler/skills/**` to `.codex/skills/`.
- Ruler writes MCP settings to `.codex/config.toml` when MCP config is present.
- Codex `.rules` files are command execution policy, not natural-language project guidance. Keep
  the committed source under `.ruler/native/codex/rules/*.rules` and copy it to `.codex/rules/`.

Verify Codex AI guidance with:

```bash
ruler apply --agents codex
mkdir -p .codex/rules
cp .ruler/native/codex/rules/*.rules .codex/rules/
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
test -f .codex/rules/default.rules
```

Do not translate Markdown guidance from `.ruler/rules/*.md` into Codex `.rules` files. Codex
command-policy files are separate native extras, and they should be verified against current OpenAI
Codex docs before changing their format.

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
