---
# Project skill bindings — consumed by ~/.claude/skills/daily-stand-up and ~/.claude/skills/wrap-up.
# Hand-edited rule file; the portable skills are project-agnostic, all the per-project values live here.

tracker: linear

linear:
  workspace: kunai
  team_prefix: OSS
  assignee_id: 15f7e516-d30c-44a6-bada-aeb635dec8a9
  state_uuids:
    in_progress: d29d316a-4cbf-43a4-a43c-c16c636747d5
    in_review:   2325618c-ff7a-466b-8443-57e477ef0673
    done:        3ef8d2b5-80f2-4e06-a8d5-de126ae8aff1

state_file:
  path: .claude/rules/STATE.md
  next_up_patterns:
    - "**Next: {ID}**"
    - "**next up: {ID}**"
    - "Next up in Phase N: {ID}"

standup:
  no_blockers_sentinel: ":none_nun:"

wrapup:
  docs_pr_branch_prefix: docs/state-post-
  docs_pr_commit_prefix: "docs(state):"
  auto_merge_carve_out_path: .claude/rules/
  state_refresh_authority: .claude/rules/METHODOLOGIES.md
  audit_doc:
    path: .claude/rules/OPTIMIZER.md
    trigger_checklist_section: "Trigger checklist for pipeline refactors"
    structural_criteria_section: "When to update"

# Rules-sync script consumed by ~/.claude/skills/agent-sync
# (mirrors .claude/rules/*.md → .cursor/rules/*.mdc).
agent_sync:
  script: scripts/agent-sync.sh
---

# Project bindings — TS-Optimizer

This file declares the bindings consumed by the portable skills at `~/.claude/skills/daily-stand-up/` and `~/.claude/skills/wrap-up/`. The skills themselves are project-agnostic; per-project values live here.

## Tracker — Linear (kunai workspace, OSS team)

Authority: `.claude/rules/LINEAR.md`.

LINEAR.md owns the auth recipe (`LINEAR_API_KEY` from `~/.zshrc`), GraphQL conventions, the workspace-constants table (state UUIDs, label IDs), the default ticket conventions (always-add `Qwik Optimizer` label, tech-debt → `TECH DEBT` + Backlog, project + team defaults), and the uppercase-`OSS-XXX` casing rule for PR titles + commit messages. PROJECT.md captures the values the skills need to consume; LINEAR.md remains authoritative for everything else (drafting workflow, mutation recipes, re-probe procedure).

The casing rule matters operationally: the GitHub→Linear integration's PR-title parser is case-sensitive, so lowercase `oss-XXX` references skip the auto-flip from In Review → Done. Four wrap-ups in a row (OSS-382/383/384/393) have hit this; the source of the bug is the commit-write step, not wrap-up itself. See LINEAR.md "Ticket references in commits and PR titles" for the canonical forms.

## State file — STATE.md

Authority: the "Maintenance" section at the bottom of `.claude/rules/STATE.md`.

STATE.md is branch-scoped: edited on feature branches only, never on `main` directly, and refreshed (not deleted) when branching off `main` for a new workstream. Wrap-up's step 4 honors that section — the trim-after-10 rule, the "what / why / risk" voice on progress entries, the "don't mechanically copy the PR description" don't, the always-vs-as-applicable split. The state file is *the* document the assistant rehydrates from at session start, so its refresh has to be a judgment edit, not a mechanical append.

## Wrap-up — post-merge routine

Authority: `.claude/rules/METHODOLOGIES.md` "After a PR merges" section.

The METHODOLOGIES rule file owns the post-merge policy; wrap-up encodes it in executable form. If the two drift, METHODOLOGIES wins.

**Auto-merge carve-out** covers any combination of files under `.claude/rules/` — typically STATE.md alone, OPTIMIZER.md alone, or STATE + OPTIMIZER together. Any diff touching files outside `.claude/rules/` (source, tests, workflows, README, package.json) goes through normal review. The carve-out was widened from STATE.md-only to `.claude/rules/`-only by PR #93 so the OPTIMIZER.md audit step (introduced in the same PR) could ride the same auto-merge path without a separate gate.

## Audit doc — OPTIMIZER.md

Authority: the "When to update" section near the bottom of `.claude/rules/OPTIMIZER.md`.

OPTIMIZER.md is the canonical walkthrough of the optimizer pipeline shape, phases, and conventions. The audit step exists because many pipeline-touching merges *don't* warrant a doc update (type-internal refactors, brand propagation, signature widening, helper extraction) — but the ones that do silently drift if no one checks. The "Trigger checklist for pipeline refactors" section lists the files whose changes warrant attention; the "When to update" section lists the structural-change criteria that actually require an inline edit.

Verdict guidance for the audit:

- **No update needed** is the right answer most of the time. Renames, brand propagation, type widening, helper extraction, parameter consolidation — all stay below the bar.
- **Update folded in** when a structural-change criterion fires: phase added/removed, new tool-surface convention (e.g. `_<helper>` import), MIG-XX rule added/removed/changed, new entry strategy, ExtractionResult field added/removed/repurposed (branding alone is type-internal — does not count), file:line refs drifted >50 lines, worked example replaced.
- **Cumulative drift** under 50 lines per cited section, accumulated across many small merges, is not caught by this audit by design — the "drift below ~30 lines" rule in OPTIMIZER.md's own Maintenance section ratifies that. When the cumulative drift bites (as in OSS-393), it's a separate doc-only PR, not a wrap-up audit failure.

## Agent sync — rules mirroring

Authority: the header comment of `scripts/agent-sync.sh`.

The script mirrors `.claude/rules/*.md` into `.cursor/rules/*.mdc` with Cursor-appropriate YAML frontmatter; `.claude/rules/` is the source of truth and the generated `.mdc` files are never hand-edited. The portable `agent-sync` skill consumes the `agent_sync.script` binding above to run it (`sync` / `check` / `clean` / `watch`); per-file activation overrides live as magic comments on the first line of each source rule file — see the script header for the directive forms.

## See also

- `CLAUDE.md` (repo root) — the authority-by-topic map.
- `.claude/rules/LINEAR.md` — full Linear conventions (workspace constants, GraphQL recipes, casing rule, drafting workflow).
- `.claude/rules/STATE.md` — current workstream + Maintenance section (refresh policy).
- `.claude/rules/METHODOLOGIES.md` — post-merge routine policy + refactoring workflow.
- `.claude/rules/OPTIMIZER.md` — pipeline walkthrough + audit trigger checklist + structural-change criteria.
- `~/.claude/skills/daily-stand-up/SKILL.md` — portable stand-up skill (consumes this file).
- `~/.claude/skills/wrap-up/SKILL.md` — portable post-merge skill (consumes this file).
- `~/.claude/skills/agent-sync/SKILL.md` — portable rules-sync skill (consumes the `agent_sync` binding).
