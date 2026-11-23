---
name: qwik-guidance-maintenance
description: Use when editing Qwik's AI agent guidance (AGENTS.md, CLAUDE.md, .agents/skills), adding or changing rules or skills, keeping AI guidance from going stale, or updating assistant setup docs.
---

# Qwik Guidance Maintenance

Use this skill for `AGENTS.md`, `.agents/skills/**`, the AI Assistants section of
`CONTRIBUTING.md`, and rule-vs-skill questions. Also use it at the end of a code task when source
inspection proves a loaded skill or reference is stale.

## Source Map

- Repo-wide guidance and always-on rules: root `AGENTS.md`, edited by hand.
- `CLAUDE.md`: the single line `@AGENTS.md`. Keep it that way so both agents read one file.
- Skills: `.agents/skills/<name>/SKILL.md`, long notes in `references/`. Codex reads this folder;
  `.claude/skills` is a committed symlink to it for Claude Code.
- Human setup: the AI Assistants section of `CONTRIBUTING.md`.

## Rule And Skill Workflow

- For a new always-on policy, add or update a section under Rules in `AGENTS.md`. Keep it short:
  every session loads it, and Codex stops reading `AGENTS.md` past 32 KiB.
- For package-specific details, update the package skill or a directly linked reference.
- For long notes, add a `references/` file only when progressive disclosure keeps the skill body
  smaller and clearer.
- For a new skill, add its folder under `.agents/skills/` with a `qwik-` name and a
  trigger-oriented `description`, and add a row to the Skill Selection table in `AGENTS.md`.
- Treat command execution policy as a separate native format from prose guidance. Do not translate
  `AGENTS.md` guidance into command-policy files just because the target tool calls them "rules".

## Freshness Workflow

When an agent uses a skill and current source contradicts it:

1. Finish the user's product-code task first unless the guidance defect blocks the task.
2. Update the narrowest file that was wrong.
3. Prefer replacing stale details over appending another long lesson.
4. Keep history-derived guidance behavioral and durable.
5. Mention the guidance update in the final response so reviewers know why the guidance changed.

## Verification

```bash
ls .claude/skills/
wc -c AGENTS.md
pnpm prettier --check AGENTS.md CLAUDE.md CONTRIBUTING.md .agents
git diff --check
```

`ls .claude/skills/` lists every skill folder. `wc -c` stays under 32768.

## Stop Conditions

- Stop if a proposed rule duplicates detailed skill content instead of summarizing durable policy.
- Stop if current Claude Code or Codex docs contradict the Source Map, and update it first.
