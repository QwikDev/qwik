---
name: qwik-guidance-maintenance
description: Use when editing Qwik's .ruler guidance, adding or changing rules or skills, keeping AI guidance from going stale, updating assistant setup docs, or answering how Ruler should generate assistant-native guidance, skills, config, or policy for this repo.
---

# Qwik Guidance Maintenance

Use this skill for `.ruler/**`, README AI assistant setup, dedicated rules, generated
assistant-output boundaries, rule-vs-skill taxonomy work, and assistant-native config questions.
Also use it at the end of a code task when source inspection proves a loaded skill or reference is
stale.

## Fast Path

1. Follow the Guidance Source Of Truth rule (in `.ruler/AGENTS.md`) for source layout, rule-vs-skill
   taxonomy, generated assistant outputs, AI config builder behavior, skill naming, and stale-guidance policy.
2. Follow the Generated Output Boundaries rule (in `.ruler/AGENTS.md`) before editing, regenerating,
   or relying on generated output.
3. Edit committed source files in `.ruler/`, not generated assistant outputs.
4. Keep new durable policy in the narrowest source: `.ruler/AGENTS.md` for repo-wide context and
   always-on rules, and `.ruler/skills/**` for task-specific workflows.
5. For a target assistant, research the current native guidance, skill, config, and policy formats
   when the mapping is ambiguous.
6. Verify Ruler behavior with a dry run when the CLI is available.
7. Verify generated guidance by checking source markers in the target assistant's native guidance
   file and generated skills in the target assistant's native skills directory when supported.

## Freshness Workflow

When an agent uses a skill and current source contradicts it:

1. Finish the user's product-code task first unless the guidance defect blocks the task.
2. Update the narrowest `.ruler` source that was wrong.
3. Prefer replacing stale details over appending another long lesson.
4. Keep history-derived guidance behavioral and durable.
5. Mention the guidance update in the final response so reviewers know why `.ruler` changed.

## Source Map

- Repo-wide guidance + always-on rules: `.ruler/AGENTS.md`
- Human setup guide: `.ruler/README.md`
- Ruler config: `.ruler/ruler.toml`
- Source skills: `.ruler/skills/**/SKILL.md`
- Generated outputs (committed): root `AGENTS.md`, root `CLAUDE.md`, and `.claude/skills/` /
  `.codex/skills/`; other `.claude/`/`.codex/`/`.cursor/` files stay local

## Rule And Skill Workflow

- For a new always-on policy, add or update a rule section in `.ruler/AGENTS.md` and its summary in
  the Source Rules index there.
- For package-specific details, update the package skill or a directly linked reference.
- For long notes, add a `references/` file only when progressive disclosure keeps the skill body
  smaller and clearer.
- For assistant setup changes, keep human setup steps in `.ruler/README.md` and behavioral agent
  rules in `.ruler/AGENTS.md`.
- For assistant output questions, use the `guidance-source-of-truth` rule unless current Ruler or
  target-tool docs have changed.
- Treat command execution policy as a separate native format from prose guidance. Do not translate
  `.ruler/AGENTS.md` guidance into command-policy files just because the target tool calls them "rules".

## Verification

Use the target assistant for the change. For a Codex example:

```bash
npx @intellectronica/ruler apply --agents codex --dry-run --no-mcp --no-gitignore
ruler apply --agents codex
rg -n 'Source: .ruler/AGENTS.md' AGENTS.md
find .codex/skills -name SKILL.md
pnpm prettier --check .ruler README.md .gitignore
git diff --check
```

If `npx` cannot reach the registry, retry only when network approval is appropriate; otherwise
record the blocker and still run local formatting/diff checks.

## Stop Conditions

- Stop before editing generated assistant outputs directly.
- Stop if a proposed rule duplicates detailed skill content instead of summarizing durable policy.
- Stop if current Ruler or target-tool docs contradict the Guidance Source Of Truth rule in
  `.ruler/AGENTS.md`.
