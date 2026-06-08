# Project state

Snapshot of where the active workstream stands. Read at the start of a session to rehydrate context fast. **Update aggressively** as meaningful progress lands — see "Maintenance" at the bottom.

Last updated: 2026-06-08 (post PR #213 merged). Convergence 203/212 unchanged; full suite 977/1002 unchanged.

## Goal

**Long-term project goal**: 100% snapshot test parity between the TS optimizer (this repo) and the SWC reference (`./swc-reference-only`), verified by `pnpm vitest convergence --run`.

**Active workstream**: [OSS-456](https://linear.app/kunai/issue/OSS-456) qwik-router lib processing parity (FAST-TRACK) — 2 of 3 sub-issues closed (Sub-A [OSS-457](https://linear.app/kunai/issue/OSS-457) + Sub-C [OSS-459](https://linear.app/kunai/issue/OSS-459) Done via PRs #211 + #213). **Sub-B ([OSS-458](https://linear.app/kunai/issue/OSS-458))** remains Backlog blocking the umbrella close — extracted segments retain `./chunks/*.qwik.mjs` imports that may not resolve under the bundler.

**Next data point needed for OSS-458**: does the same `fixtures/vite-qwik-router` build produce 30+ `UNRESOLVED_IMPORT` errors under SWC mode (default — no `experimental: ['tsOptimizer']` flag)? If yes → bundler-side, close OSS-458 as not-our-bug. If no → real TS-optimizer parity gap. Diagnostic clue: SWC's expected snap for `example_qwik_router_client` also contains 26 `./chunks/routing.qwik.mjs` references, so both backends emit them and the bundler must have resolution logic that works for SWC's emit.

For history of prior workstreams: `git log`, Linear, and the per-PR commit messages.

## Current measurements

| Metric | Value |
|---|---|
| Convergence failing | **9 / 212** |
| Convergence passing | **203 / 212** (95.8%) |
| Full suite failing | 26 / 980 |
| Full suite passing | 952 / 980 |
| Last verified | 2026-06-08 on `main` (post PR #213) |

## CI infrastructure (live)

Landed via [OSS-341](https://linear.app/kunai/issue/OSS-341) / [OSS-342](https://linear.app/kunai/issue/OSS-342). Full mechanism in `REGRESSION.md`.

- **`.github/workflows/test.yml`** — every PR to `main`. Typecheck → full vitest → name-based regression check against `.ci/baseline.json`. Fails the PR if any baseline-passing test ID is now failing.
- **`.github/workflows/update-baseline.yml`** — push to `main`. Auto-regenerates `.ci/baseline.json` via `github-actions[bot]` with `[skip ci]`.
- **Node `>=22`** required — `oxc-parser`'s `experimentalRawTransfer` throws on Node 20.

Local commands:

- `pnpm typecheck` — `tsc --noEmit`
- `pnpm ci:baseline:check <vitest-json>` — local regression check
- `pnpm ci:baseline:update <vitest-json>` — regenerate baseline (rare; auto-update on `main` is preferred)
- `node scripts/diff-platform-results.mjs <vitest-json>` — cross-environment diff tool

## Branches in flight

| Branch | Head | Pushed | Tests | Notes |
|---|---|---|---|---|
| `main` | `5a2b6c7` (PR #213) | ✅ | baseline | Active workstream: OSS-456 (see Goal). Other open backlog: OSS-447 + OSS-448 (block `example_qwik_router_client` flip); OSS-439 (F3 multi-session); OSS-450 Sub-D in qwik-bundler PR #12. |
| `oxc-port` | `073a11d` | ✅ | n/a (Rust) | Long-lived Rust/OXC port. Subtree-imported `qwik-optimizer` as `oxc/`; oxc 0.129 / napi 3. 31/31 cargo tests passing. Not blocking TS work. |
| `ast-parity/F2` | `a644c16` (stale) | ❌ local-only | parked | F2 cluster fully closed via OSS-403 siblings on `main` — safe to delete. |

## Refactor track v2 ([OSS-343](https://linear.app/kunai/issue/OSS-343)) — closed

All 7 sub-issues Done. `generateAllSegmentModules` orchestrator at `src/optimizer/transform/segment-generation.ts` is now a 34-line sequencer over named helpers (down from 580 lines pre-refactor, ~94% reduction). Per-Sub scope in `.planning/specs/segment-generation-refactor.md`. See Linear [OSS-343](https://linear.app/kunai/issue/OSS-343) for rolled-up sub-issue history (OSS-344/345/346/347/356/357/358).

## Refactor track v1 ([OSS-337](https://linear.app/kunai/issue/OSS-337)) — closed

OSS-338/339/340 all merged. See Linear / `git log` for shape; v2 follows the same playbook.

## Parity feature status

Snapshot of features tracked in `CONVERGENCE_FAILURES.md`. F-suffix letters (F1b, F1c) are sub-features that emerged from in-flight rescoping.

| Feature | Status | Notes |
|---|---|---|
| F1 / F1b / F4 / F5 / F6 / F9 | ✅ CLOSED | See Linear for closure PRs |
| F1c | LANDED (foundation only) | Statement-order on `ast-parity/F2`; test won't flip until F2 path/hash/key-prefix bugs also addressed |
| F2 | ✅ CLOSED | [OSS-403](https://linear.app/kunai/issue/OSS-403) umbrella — 10-PR arc (PRs #134–#155); only OSS-410 (surface-only) follow-up remains |
| F3 | OPEN | [OSS-439](https://linear.app/kunai/issue/OSS-439) — 4-5 tests, multi-session |
| F7 | DECLASSIFIED | Per 2026-05-27 audit; fixtures redistributed — see `CONVERGENCE_FAILURES.md` |
| F8 | ✅ CLOSED | Residual `example_qwik_react` has different root cause (migration `_auto_filterProps`) |
| F10 | PARTIAL (1/2) | Sub-A [OSS-437](https://linear.app/kunai/issue/OSS-437) Done; Sub-B (`example_qwik_router_client`) blocked by OSS-447 + OSS-448 |

Full feature analysis: `CONVERGENCE_FAILURES.md`.

## Most recent meaningful progress

Most recent first. **Each entry is a one-line pointer — drill into the PR, commit message, or Linear ticket for full detail.** Trim entries past ~10.

- **2026-06-08** — PR #213: regression tests for the OSS-456 qwik-router lib processing umbrella. Pins OSS-457 + OSS-459 (inadvertent fixes from PR #211) via tests at `tests/optimizer/router-lib-processing.test.ts` against a full 1703-line `@qwik.dev/router` lib fixture. `test.fails` placeholder for OSS-458. OSS-457 + OSS-459 closed Done.
- **2026-06-05** — PR #211: two TS-optimizer router-integration bugs fixed (`mkSymbolName` brand crash on `routes/<dir>/index.tsx` collisions; spurious C02 narrowed to only fire when an enclosing closure exists). Inadvertently resolved OSS-457 + OSS-459. Caught while reproducing Jack's qwik-bundler smoke failure.
- **2026-06-04** — PRs #207 + #208: qwik-optimizer-ts packaging fixes — 3 runtime deps (`oxc-parser`/`oxc-walker`/`oxc-transform`) mis-bucketed in `devDependencies`; segment `module.path` namespace divergence (now mirrors SWC via `inputPath` threading). rolldown-h3 demo now runs end-to-end under `experimental: ['tsOptimizer']`.
- **2026-06-04** — PR #205 ([OSS-453](https://linear.app/kunai/issue/OSS-453)): Sub-C of OSS-450 qwik-bundler integration. `preParsedProgram` thread-through wired from public boundary to extract; `repairInput` short-circuits its internal parse when Program supplied. `@oxc-project/types` promoted to runtime dep.
- **2026-06-04** — PR #203 ([OSS-452](https://linear.app/kunai/issue/OSS-452)): Sub-B of OSS-450. `createOptimizer` factory matching SWC's stateful-async shape; default `sys` stub satisfies full `OptimizerSystem` interface.
- **2026-06-04** — PR #200 ([OSS-451](https://linear.app/kunai/issue/OSS-451)): Sub-A of OSS-450. New `src/index.ts` barrel + `tsconfig.build.json` + `package.json.exports`. Public API surface foundation.
- **2026-06-03** — PRs #192–#196 ([OSS-449](https://linear.app/kunai/issue/OSS-449)): 5-stacked-PR comment cleanup sweep. All 243 Linear ticket refs stripped from `src/` across 36 files; established `feedback_comments_explain_why` memory. 0 behaviour change.
- **2026-06-01** — PR #190 ([OSS-446](https://linear.app/kunai/issue/OSS-446) foundation): peer-tool `jsx()` extraction context + parent `jsx() → _jsxSorted` rewrite + lexical scope chain for captures (`buildClosureLexicalScopes`). +13 regression tests; baselines unchanged. Convergence flip on `example_qwik_router_client` gated on OSS-447 + OSS-448.
- **2026-06-01** — PR #188 ([OSS-445](https://linear.app/kunai/issue/OSS-445)): `transformAllJsx` 14 args → 2 via `TransformAllJsxInput` + `TransformAllJsxOptions`. Closes the OSS-374/375/376/377 parameter-reduction arc. Baselines unchanged.
- **2026-06-01** — PR #186 ([OSS-410](https://linear.app/kunai/issue/OSS-410)): JSX dev-info source-relative positions for Inline strategy + default-strategy segment-file paths. Surface-only fix; +6 regression tests. CBP rule "No nested ternaries" added.

## What to do next

**Two candidate workstreams.** Pick based on appetite — parity progress vs integration milestone.

### Candidate A — Parity continuation (OSS-447 + OSS-448, blocks OSS-446)

OSS-446 (In Progress; parent of OSS-447 + OSS-448). Convergence at **203/212 (95.8%)** — 9 failing. OSS-446's three documented bugs landed via PR #190. The convergence flip on `example_qwik_router_client` is gated on two follow-up sub-issues filed mid-impl per `feedback_parity_audit_multi_root_cause`:

- **[OSS-447](https://linear.app/kunai/issue/OSS-447)** — migration policy for non-marker module-level helpers consumed by exactly one segment (`useQwikMockRouter` case). New arm in `decideMigration` + orphan-QRL-binding-drop pass.
- **[OSS-448](https://linear.app/kunai/issue/OSS-448)** — scope-aware import DCE in `filterUnusedImports`. Replace the regex-based identifier test with a scope-aware AST walk; can reuse OSS-446 Bug 3's `buildClosureLexicalScopes` infrastructure.

Both required to flip the fixture. After they land, OSS-446 closes on its original acceptance.

### Candidate B — qwik-bundler integration ([OSS-450](https://linear.app/kunai/issue/OSS-450) umbrella)

TS optimizer drop-in for [qwik-bundler](https://github.com/thejackshelton/qwik-bundler). Goal: optional `experimental: ['tsOptimizer']` flag inside `createQwikPlugin`. Convergence is high enough (95.8%) that integration becomes the meaningful next milestone — gets the rewrite running real apps via Rolldown/Vite, provides a real-world test surface beyond the snapshot suite.

Three locked design choices: (1) adapter lives in this repo; (2) reuse the bundler's pre-parsed AST via `meta.ast`; (3) parser-agnostic ESTree-compatible `Program` contract (so Yuku swap-in works in the future).

- **[OSS-451](https://linear.app/kunai/issue/OSS-451) (Sub-A)** — Public API surface. ✅ Done (PR #200).
- **[OSS-452](https://linear.app/kunai/issue/OSS-452) (Sub-B)** — `createOptimizer` factory. ✅ Done (PR #203).
- **[OSS-453](https://linear.app/kunai/issue/OSS-453) (Sub-C)** — `preParsedProgram` thread-through. ✅ Done (PR #205).
- **[OSS-454](https://linear.app/kunai/issue/OSS-454) (Sub-D)** — Bundler-side adapter (qwik-bundler PR #12, open + mergeable).
- **[OSS-455](https://linear.app/kunai/issue/OSS-455) (Sub-E)** — Parity smoke fixture.

Persists across sessions via project memory `[[project_qwik_bundler_integration]]`.

### Trade-off

Candidate A keeps the parity gauge moving (`example_qwik_router_client` flip would take convergence to 204/212). Candidate B doesn't flip any test but unlocks real-world usage of the rewrite + provides a richer test surface. Independent — A and B don't share code paths.

### Other parity backlog

- **[OSS-439](https://linear.app/kunai/issue/OSS-439)** (F3 umbrella — Backlog) — Lightweight inline component support. 4-5 tests. Foundation archived on `archive/oss-439-rawprops-foundation`. Needs 2-3 sub-tickets before resuming. Multi-session workstream.
- **F10 Sub-B** = OSS-446 + OSS-447 + OSS-448 (`example_qwik_router_client`).
- **[OSS-410](https://linear.app/kunai/issue/OSS-410)** — surface-only sibling of OSS-408; target test already passes via compareAst normalization but emit divergence is real. Narrow single-session.
- **Standalone fixtures**: `example_invalid_segment_expr1` (single-use binding inlining missing); `fun_with_scopes` (F2 inline-strategy edge cases); `example_use_optimization` (F8 chained-destructure folding, comparable to OSS-363's `flatten-destructures.ts`). File when picked up.

### Held / deferred (not blocking pickup)

- Broader `simplify` coverage beyond `utils/simplify.ts`'s current scope.
- Perf follow-ups: BENCH-01 at 2.66× (cap 1.15×); BENCH-02 at 4.67× (cap 1.5×). File a Linear ticket per workstream; append `BENCHMARKS.md` row before/after.
- De-any in `src/testing/ast-compare.ts` (~150) + `tests/optimizer/` (~22). Mechanical.
- Two [OSS-347](https://linear.app/kunai/issue/OSS-347) backlog candidates (per-iteration `ext` mutation; split `SegmentGenerationContext`'s 28 fields). File when picked up.
- Three [OSS-381](https://linear.app/kunai/issue/OSS-381) Phase 3 candidates — low-value/high-risk per OSS-398 audit.
- Rust/OXC port (`oxc-port` branch). Scaffolding-only; not blocking TS work.

**Pickup-cold reading order**: `OPTIMIZER.md` (Two-namespaces section + Phase pipeline table + marker catalog) → `BENCHMARKS.md` → `CONVERGENCE_FAILURES.md`.

## Maintenance

**You are expected to update this file actively.** Not a passive snapshot — a working artifact.

### Branch scoping

Unlike other files in `.claude/rules/` (CONSTRAINTS, REGRESSION, METHODOLOGIES, CONVERGENCE_FAILURES, LINEAR, OPTIMIZER) which are project-wide rules edited in isolation, **STATE.md is branch-scoped**. It reflects the active workstream of whatever branch it's committed on:

- **Edit/commit on feature & working branches only.** Never edit STATE.md directly on `main` as part of a standalone changeset. Never cherry-pick a STATE.md change to `main`.
- **It travels with merges.** When a feature branch merges into `main`, its STATE.md comes along naturally.
- **A branch without STATE.md is fine.** Create one when meaningful work begins.
- **Refresh on new branches.** Don't carry over stale state from unrelated work.

In short: STATE.md is *authored* on feature branches, *propagates* through merges, and is *refreshed* (not deleted) on new branches.

### When to update

Update when:

- A test flips status (passing ↔ failing).
- A feature's status changes (OPEN → PARTIAL → CLOSED).
- A branch is created, merged, abandoned, or force-pushed.
- A Linear ticket's status changes (Backlog → In Progress → In Review → Done) for tickets the active workstream tracks.
- A feature description is materially corrected.
- A new substantial discovery refines scope.

Don't update for:

- Every commit (commit messages are the source of truth there).
- Mid-investigation debugging.
- Speculation about future features.

Each update:

1. Bump the "Last updated" date.
2. Add a **one-line entry** at the top of "Most recent meaningful progress" — include the PR # + Linear ticket so the reader can drill down. Avoid embedding "what landed" essays here; that's what the PR description, commit message, and Linear comments are for.
3. Trim entries past ~10.
4. Update "Current measurements" if test counts changed.
5. Update "Branches in flight", "Refactor track v2", or "Parity feature status" tables if any changed.

### Keep entries short

The progress log accumulates fast. Each entry should be a **pointer** — date, PR #, ticket, one-line description of what shifted. The full rationale lives in the PR body, commit message, and Linear ticket; STATE.md just needs enough hook to find it. If you're tempted to write more than a sentence or two, the detail belongs in the PR / commit / ticket instead.

## Where to look for more

- `OPTIMIZER.md` — end-to-end pipeline walkthrough with deep dives on capture analysis, migration policy, JSX rewrite, and segment metadata. Read this when onboarding into a new optimizer area.
- [`BENCHMARKS.md`](../../BENCHMARKS.md) (repo root) — perf-history doc tracking BENCH-01 / BENCH-02 wall-time vs the SWC reference.
- `CONVERGENCE_FAILURES.md` — feature breakdown with per-test root causes.
- `CONSTRAINTS.md` — hard rules (read-only directories).
- `REGRESSION.md` — regression invariants (CI-enforced).
- `METHODOLOGIES.md` — process / workflow rules including the Refactoring section and the post-merge routine.
- `LINEAR.md` — ticket management conventions including state UUIDs and auto-assignment.
- `PROJECT.md` — portable-skill bindings (tracker, state file, stand-up + wrap-up config).
- `.github/workflows/README.md` — CI workflow documentation.
- Linear [OSS-343](https://linear.app/kunai/issue/OSS-343) — refactor track v2 parent (rolls up sub-issue completion).
- `git log` — full history of merges; commit messages carry the *why*.
- `pnpm vitest convergence --run` — current parity measurement.
- `pnpm ci:baseline:check <vitest-json>` — local regression check against stored baseline.
- `tests/optimizer/failure-families.test.ts` — secondary signal (broader, less strict than convergence).
