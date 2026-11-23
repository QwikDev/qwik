---
name: qwik-plan
description: Plan a change for my review, and write PR descriptions in the plan's format. Use when I ask for a plan, in a sentence or with /qwik-plan, and when writing a PR description.
---

# Qwik Plan

Draft in the chat until step 4, then write the plan in plan mode's plan file, which the plan pane
shows (in tools without plan mode, in `.claude/plans/<topic>.md`). Never commit the plan,
`.claude/poc/` or `.claude/other-libs/`. Apart from POCs, don't edit project files until I approve
the plan.

A forked session starts a fresh plan.

## Steps

1. **Pin down the issue.** Read enough code to explain it, draft the Issue, Related issues and Goal
   sections in the chat, with your questions (AskUserQuestion). Don't research solutions until I
   confirm them.
2. **Research.** Read how the code works today. When it's worth it, ask me in one short question
   (AskUserQuestion) which of these to run, naming each library and POC and the folder it will go
   in, with no method, cost or caveats, and start them only on my yes:
   - **Other libraries**, when the general problem is likely solved elsewhere: one subagent per
     library (`researcher` when defined), each in its own `.claude/other-libs/<name>/` folder in
     this session's folder.
   - **POCs**, when a specific solution needs checking in this repo: one subagent per POC
     (`researcher` when defined), each in its own `.claude/poc/<name>/` folder in this session's
     folder.

   Start all of them at once, in parallel.

3. **Offer a problem-space study when it's worth it.** When the design holds several separate
   choices, or a choice needs careful trade-offs, offer a problem-space study laid out as in
   [references/problem-space.md](references/problem-space.md). Start it only on my yes.
4. **Write the plan.** Enter plan mode, write the whole plan to its plan file, then call
   ExitPlanMode for my review.

On feedback, edit the plan in place and list what changed at the top. Write in plain English and the
project's words.

## Sections

1. **Issue**: the problem from the user's or the developer's side, explained from scratch, in two
   sub-sections:
   - **Problem space**: the general problem, outside this codebase.
   - **Current state**: how the code handles it today and where it fails. A minimal repro code
     example if applicable.
2. **Related issues**: other problems that touch this one, each with a line on how, when there are
   any. When one should be fixed first, ask me; on my yes, start a session to fix it in its own
   worktree: a fork when it needs this conversation (it gets its own worktree only when this session
   runs in one), otherwise a fresh session with `use_worktree: true`.
3. **Goal**: one or two sentences on what's true once we're done. Then **Non-goals**: what this work
   leaves out on purpose.
4. **Solutions and risks**: the approaches worth weighing, lettered A, B, C. Under each, its risks
   numbered A1, A2: how it could break things compared with today. With a problem-space study, the
   study takes this section's place.
5. **Target design**: the chosen solution and why. When several real use cases matter, give each a
   short subsection with a code example, comparing the choice with the others.
6. **Plan**: the steps, with every test of the target design grouped in `describe` blocks, as a tree
   per test file in a code block: `✓` existing, `+` added, `~` changed, `-` removed. Existing tests
   keep their real names unless a plain-English rename reads clearer (mark it `~`); new tests get
   plain-English names. Each risk of the chosen solution gets at least one test, tagged with its ID.
   So does another solution's risk that could hit the chosen one too, or that a later change could
   bring back. With a problem-space study, each use case the chosen options pass that a test can
   check, tagged UC1, UC2. Approving the plan approves these tests.
7. **Follow-ups**: small, clear TODOs found along the way that this work doesn't need.
8. **Further exploration**: questions not clear enough to plan yet; they need research first.

Mark with ⚠ any risk, use case or test that could let a bug through unless I review it closely:
you're unsure the design handles it, unsure the test would catch it, or a mistake would break
behavior users rely on. Put it right after the ID on risks and use cases (`B2⚠`), and right after
the `+`/`~`/`-` symbol on tests (`+⚠`). Give a few words on why next to each marked risk or use
case, and next to a test only when the test itself is the doubt. List every marked item in a
**Review first** line under the plan's title. Keep them few: if everything is marked, nothing is.

Test tree example, with B chosen:

```
src/queue.unit.ts
describe('runAll')
  ✓ runs every task
  + keeps the count right when a task throws (B1)
  +⚠ runs tasks queued while running (B2)
  + returns the error of each failed task (A1)
```

## Pull Requests

Keep the repo's PR template, and write its Description in the plan's format: the same sections in
the same order, with the Plan's steps saying what the PR changed. When a GitHub issue already
covers the problem, link it (`fixes #1234`) in place of the Issue section, and keep a two-line
summary of the current state and its repro so reviewers don't need to open the issue; still write
the Problem space when the issue doesn't lay it out clearly. Link related issues that are already
filed the same way.

Don't file an issue for the problem the PR fixes. Offer to file one, using the repo's issue
template, for a related issue or follow-up the PR leaves out when users are likely to hit it, or
when the design needs discussion before code.
