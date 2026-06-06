---
name: qwik-guidance-maintenance
description: Use when editing Qwik's .ruler guidance, adding or changing rules or skills, keeping AI guidance from going stale, updating assistant setup docs, or answering how Ruler should generate Codex, Claude, Cursor, or Copilot guidance for this repo.
---

# Qwik Guidance Maintenance

Use this skill for `.ruler/**`, README AI assistant setup, dedicated rules, generated
assistant-output boundaries, and rule-vs-skill taxonomy work. Also use it at the end of a code task
when source inspection proves a loaded skill or reference is stale.

## Fast Path

1. Follow `.ruler/rules/guidance-source-of-truth.md` for source layout, rule-vs-skill taxonomy,
   generated assistant outputs, Codex output, skill naming, and stale-guidance policy.
2. Follow `.ruler/rules/generated-output-boundaries.md` before editing, regenerating, or relying on
   generated output.
3. Edit committed source files in `.ruler/`, not generated assistant outputs.
4. Keep new durable policy in the narrowest source: `.ruler/AGENTS.md` for short repo-wide context,
   `.ruler/rules/*.md` for dedicated always-on rules, and `.ruler/skills/**` for task-specific
   workflows.
5. Verify Ruler behavior with a dry run when the CLI is available.
6. For Codex, verify that `.ruler/rules/*.md` content appears inside generated root `AGENTS.md` and
   that `.ruler/skills/**` appears under `.codex/skills/**`.

## Freshness Workflow

When an agent uses a skill and current source contradicts it:

1. Finish the user's product-code task first unless the guidance defect blocks the task.
2. Update the narrowest `.ruler` source that was wrong.
3. Prefer replacing stale details over appending another long lesson.
4. Keep history-derived guidance behavioral and durable.
5. Mention the guidance update in the final response so reviewers know why `.ruler` changed.

## Source Map

- Repo-wide rules: `.ruler/AGENTS.md`
- Dedicated source rules: `.ruler/rules/*.md`
- Human setup guide: `.ruler/README.md`
- Ruler config: `.ruler/ruler.toml`
- Source skills: `.ruler/skills/**/SKILL.md`
- Generated outputs ignored by Git: root `AGENTS.md`, root `CLAUDE.md`, `.codex/`, `.claude/`,
  `.cursor/`

## Rule And Skill Workflow

- For a new always-on policy, add or update a dedicated rule and list it in `.ruler/AGENTS.md` and
  `.ruler/README.md`.
- For package-specific details, update the package skill or a directly linked reference.
- For long notes, add a `references/` file only when progressive disclosure keeps the skill body
  smaller and clearer.
- For assistant setup changes, keep human setup steps in `.ruler/README.md` and behavioral agent
  rules in `.ruler/AGENTS.md` or `.ruler/rules/**`.
- For Codex output questions, use the `guidance-source-of-truth` rule unless current Ruler or
  OpenAI Codex docs have changed.
- Do not expect or document a Codex `.codex/rules/` output unless current Codex docs add that as a
  repo guidance format. Today Codex repo rules come from generated root `AGENTS.md`.

## Verification

Use:

```bash
npx @intellectronica/ruler apply --agents codex --dry-run --no-mcp --no-gitignore
rg -n 'Source: .ruler/rules' AGENTS.md
find .codex/skills -name SKILL.md
pnpm prettier --check .ruler README.md .gitignore
git diff --check
```

If `npx` cannot reach the registry, retry only when network approval is appropriate; otherwise
record the blocker and still run local formatting/diff checks.

## Stop Conditions

- Stop before editing generated assistant outputs directly.
- Stop if a proposed rule duplicates detailed skill content instead of summarizing durable policy.
- Stop if current Ruler/OpenAI docs contradict the Codex output decision in
  `.ruler/rules/guidance-source-of-truth.md`.
