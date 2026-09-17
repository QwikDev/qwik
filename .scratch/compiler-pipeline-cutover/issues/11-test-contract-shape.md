# Snapshot split, schema-variant coverage gate, compiler vitest project
Type: grilling
Status: resolved
Blocked by:

## Question

`snapshots.unit.ts` is 3347 lines over 434 snap files; there is no `compiler` vitest project
and no package test script; 40 of 67 pipeline source files have no direct test (covered via
snapshots). Decide: the split axis for snapshot suites (by JSX-IMPLEMENTATION group? by
construct family?), whether the 16 `test.todo` stay or become tickets, the mechanism for the
`LinkedPlan` variant-coverage gate (which enums, how a fixture registers coverage, what
"uncovered" fails), which pure helpers get direct unit tests, and whether a `compiler` vitest
project and `pnpm test.compiler` script are added.

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Split**: `snapshots.unit.ts` becomes one file per construct family named after the analyser concern
  (`jsx-value`, `events`, `props`, `collections`, `projections`, `setup-hooks`, `html-namespaces`,
  `dynamic-tags`, `async-boundaries`). Snap file names unchanged; zero-diff move.
- **Fixtures as data**: each family exports a registry `tests/fixtures/<family>.ts` (`{ name, path?, code }[]`).
  Consumers: the snapshot tests, the artifact fresh-process gate (ticket 05), the variant-coverage gate, the
  reference interpreter (ticket 07).
- **Variant-coverage gate**: `coverage.unit.ts` links the whole registry once, collects every discriminant
  value per schema `const enum` from the linked plans, reads the enum declarations from `schema/*.ts` text
  (layerA precedent), and fails on any unproduced value not on an explicit hand-maintained allowlist.
  Shrinking the allowlist is the coverage metric.
- **Plan snapshots**: a third file per fixture, `<name>.plan.snap`, holding the linked server plan JSON with
  relocated paths, so schema changes show as diffs of the native-facing contract.
- **Todos**: none survive. Eight already covered and four legacy/Rust ones are deleted; Suspense/Reveal
  (ticket 08), the artifact (ticket 05), library mode and the constants sweep (fog) become fixtures when
  their work lands.
- **Direct unit tests**: only pure helpers with no plan/AST input (`html.ts`, `static-subtree.ts`, the moved
  `source-maps.ts`; `schema`, `segment-identity`, `library-plan` exist). No per-file tests for lowering or
  emission.
- **Project**: a named `compiler` project in the root vitest config and a root `test.compiler` script.
