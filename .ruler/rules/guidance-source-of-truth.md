# Guidance Source Of Truth Rule

Keep shared AI guidance in the committed `.ruler` source tree. Generated assistant files are local
outputs, not source.

## Source Layout

- Put short repo-wide context in `.ruler/AGENTS.md`.
- Put dedicated always-on rules in `.ruler/rules/<rule-name>.md`.
- Put task-specific workflows in `.ruler/skills/<skill-name>/SKILL.md`.
- Put Codex command-permission policy in `.ruler/codex/rules/<rule-name>.rules`.
- Put long, conditional notes in a skill `references/` file only when progressive disclosure helps.
- Keep the `qwik-` prefix on committed Qwik skill names unless Ruler gains repo-scoped skill
  namespacing that makes the prefix redundant.

## Generated Assistant Outputs

- Do not hand-edit or commit generated assistant outputs such as root `AGENTS.md`, root `CLAUDE.md`,
  `.codex/`, `.claude/`, `.cursor/`, or generated skill directories.
- To change assistant behavior, edit `.ruler/AGENTS.md`, `.ruler/README.md`,
  `.ruler/rules/**`, or `.ruler/skills/**`.
- Regenerate local assistant outputs with Ruler only when needed for verification or local use.

## Codex Output

For this repo, Ruler handles Codex output:

- Codex AI guidance rules are generated into root `AGENTS.md`, including `.ruler/rules/*.md`
  content marked with `<!-- Source: .ruler/rules/... -->` comments.
- Codex skills are generated to `.codex/skills/`.
- Codex project config and MCP settings are generated to `.codex/config.toml` when configured.
- Codex `.rules` files are command-permission policy, not natural-language project guidance.

Do not translate Markdown guidance from `.ruler/rules/*.md` into Codex `.rules` files. A Codex
`.rules` file belongs under `.codex/rules/` and contains command policy such as
`prefix_rule(pattern=["git", "switch"], decision="allow")`.
Use `.ruler/codex/rules/*.rules` as the committed source and copy it to `.codex/rules/*.rules`
during local Codex setup.

Verify Codex AI guidance rules with:

```bash
rg -n 'Source: .ruler/rules' AGENTS.md
```

Verify Codex command-permission rules with:

```bash
codex execpolicy check --rules .codex/rules/default.rules -- git status
```

Do not infer command permissions from prose guidance.

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
