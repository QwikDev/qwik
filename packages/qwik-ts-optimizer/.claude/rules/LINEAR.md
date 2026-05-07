# Linear ticket management

How to create and manage tickets in this project's Linear workspace. The user prefers tickets be drafted in chat first, approved, then created via the GraphQL API.

## Auth

`LINEAR_API_KEY` is set in the user's `~/.zshrc`. Always run `source ~/.zshrc` before any `curl` to the Linear API — bash invocations don't inherit the interactive shell.

```bash
source ~/.zshrc
curl -sS https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '...'
```

If the key isn't in env after sourcing, stop and tell the user — don't try to find it elsewhere or hard-code it.

## Workspace constants

Verified 2026-05-07. Re-probe via API if a request 404s — labels/states get renamed.

| Thing | Value |
|---|---|
| Workspace | `linear.app/kunai` |
| Team **Open-Source** (`OSS`) | `6809d650-bb22-41ed-8b29-fadea9a6845a` |
| Project **Qwik Optimizer Rewrite** | `68ceb0b7-a527-4875-b263-4554498df67f` |
| State **Backlog** | `6a715dec-622f-4b47-a375-f9f3187764f1` |
| State **In Progress** | `d29d316a-4cbf-43a4-a43c-c16c636747d5` |
| State **In Review** | `2325618c-ff7a-466b-8443-57e477ef0673` |
| State **Done** | `3ef8d2b5-80f2-4e06-a8d5-de126ae8aff1` |
| Label **Qwik Optimizer** | `993c1f3b-6d98-4d05-9c06-5b9c0ec67cc4` |
| Label **TECH DEBT** | `21f7debc-0965-4b8f-957c-f63798d81fc1` |

Re-probe recipe:

```bash
source ~/.zshrc
curl -sS https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":"{ team(id:\"6809d650-bb22-41ed-8b29-fadea9a6845a\") { projects { nodes { id name } } states { nodes { id name type } } labels { nodes { id name } } } }"}'
```

## Default conventions

When the user asks for a ticket without specifying labels/state/project:

- **Always** include the `Qwik Optimizer` label.
- For tech debt (refactors, code-smell cleanup, instrumentation): also include `TECH DEBT` and set state to `Backlog`.
- Default project: `Qwik Optimizer Rewrite` unless the request is clearly outside it.
- Default team: `Open-Source` (key `OSS`).

If the user specifies different values, follow them.

## Assignment on "In Progress" transitions

When **creating** a ticket directly in `In Progress` state, OR **updating** a ticket's state to `In Progress`, run `id -un` first:

- If it returns `scottweaver`, include `assigneeId: 15f7e516-d30c-44a6-bada-aeb635dec8a9` (Scott's Linear user ID, displayName `scott.t.weaver`) in the mutation input.
- For any other local user, do NOT auto-assign. Leave the ticket unassigned and let the human decide.

Other states (`Backlog`, `Todo`, `In Review`, `Done`, `Cancelled`) get no auto-assignment. Don't override an explicit assignee the user has named.

Rationale: an unassigned `In Progress` ticket is ambiguous about ownership. The `id -un` check is the durable way to confirm the assistant is running as Scott rather than as a teammate or CI runner.

## Workflow

1. **Draft in chat first.** Show full title + description (markdown) for every ticket before creating. Include labels, state, project, and parent/sub structure if applicable.
2. **Confirm before creating.** Wait for explicit approval (e.g. "looks good", "create them"). Don't bundle creation with the draft message.
3. **Create.** Use the API recipe below. Show the response (identifier + URL) for each created issue.
4. **Cleanup.** Remove any temp draft files (`/tmp/linear-issues/*`) after success.

## Drafting hints

- For >2 related tickets, propose **parent + sub-issues** structure. Linear rolls sub-completion up automatically and each can be picked up independently.
- Keep titles imperative + scannable ("Surface X", "Audit Y"), not declarative ("There is a problem with...").
- Markdown tables are good for site lists (file + line + function).
- Acceptance criteria as a checkbox list. Include at least one verifiable item per ticket.

## Recipe: create issues with markdown bodies

Markdown often contains characters that break inline JSON escaping (backticks, quotes, code fences). Always write descriptions to files and use `jq --rawfile` to embed them safely.

```bash
mkdir -p /tmp/linear-issues
# write descriptions to /tmp/linear-issues/<name>.md per issue

source ~/.zshrc
TEAM=6809d650-bb22-41ed-8b29-fadea9a6845a
PROJECT=68ceb0b7-a527-4875-b263-4554498df67f
STATE_BACKLOG=6a715dec-622f-4b47-a375-f9f3187764f1
LBL_OPT=993c1f3b-6d98-4d05-9c06-5b9c0ec67cc4
LBL_DEBT=21f7debc-0965-4b8f-957c-f63798d81fc1

QUERY='mutation IssueCreate($input: IssueCreateInput!){
  issueCreate(input:$input){ success issue{ id identifier title url } }
}'

INPUT=$(jq -n \
  --arg teamId "$TEAM" --arg projectId "$PROJECT" --arg stateId "$STATE_BACKLOG" \
  --arg lbl1 "$LBL_OPT" --arg lbl2 "$LBL_DEBT" \
  --arg title "Issue title goes here" \
  --rawfile description /tmp/linear-issues/body.md \
  '{input:{teamId:$teamId, projectId:$projectId, stateId:$stateId,
           labelIds:[$lbl1,$lbl2], title:$title, description:$description}}')

REQ=$(jq -n --arg q "$QUERY" --argjson v "$INPUT" '{query:$q, variables:$v}')

curl -sS https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" -H "Content-Type: application/json" \
  -d "$REQ" | jq .
```

For a **sub-issue**, add `parentId: <parent-uuid>` to the `input` object. Capture the parent's `id` from its create response first.

## Recipe: update / move / comment

These are placeholders — fill in by probing Linear's GraphQL schema docs (https://developers.linear.app/docs/graphql/working-with-the-graphql-api) when first needed:

- `issueUpdate(id, input)` — change state, labels, assignee, parent, etc.
- `commentCreate(input: { issueId, body })` — add a comment.
- `issueArchive(id)` / `issueDelete(id)` — never run without explicit user approval.

## Don'ts

- Don't create issues silently — always draft + confirm.
- Don't put the API key in committed code, scripts, or even temp files. Read it from env only.
- Don't archive/delete/close issues without explicit approval.
- Don't paste long descriptions inline into the GraphQL JSON. Use `--rawfile`.
- Don't assume label/state UUIDs are stable indefinitely — re-probe if a 404 hits.
