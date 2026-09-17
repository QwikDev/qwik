# What fails a complete link
Type: grilling
Status: resolved
Blocked by:

## Question

Research 17 showed `complete: true` fails on both real apps: any module carrying a diagnostic (a
`dom-nesting` in `render.tsx`, a `raw-text-content` in `signals.tsx`) becomes `non-portable-export`
and fails the whole link. Ticket 05 writes artifacts only from complete links, so decide the rule:
which conditions fail completeness (a dangling resolved edge, a failed explicit root, an unresolved
edge), which taint only the exports they reach (a diagnostic inside one program), and which are
tolerated (`External` bare-specifier edges). Define what `complete` means for the artifact reader and
how the diagnostics list distinguishes the three. Also: does an `UnsupportedError` thrown by the
analyser for one module fail the app link or produce a failed `ModuleKind` that taints its exports?

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Per-declaration taint**: a refusal aborts only the candidate it hit, records the diagnostic, and marks that
  declaration `Failed` with the code; the module's other components, hooks, exports and bindings link
  normally. `ModuleKind.Failed` for a whole module ends; `non-portable-export` no longer cascades from one
  diagnostic.
- **`analyseModule` never throws**: every refusal is a diagnostic on the plan tainting the declaration it aborted.
- **Complete link fails only on reachable failures** from an entry: a dangling resolved edge, a non-External
  unresolved edge, a failed explicit export root, a tainted declaration, and under `jsHoles: 'forbid'` a server
  hole. Unreachable taint is reported, not fatal. Completeness reads the existing reachability walk.
- **Reader contract**: `complete: true` means that set is empty. Diagnostics gain `reachable: boolean` beside
  their category; `readLinkedPlan` validates that a complete plan has no reachable error.
- **Dev**: a tainted declaration fails that module's transform with the diagnostic (overlay names declaration
  and location), while the live plan keeps the module's other declarations linkable.
