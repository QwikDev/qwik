# `src/` — the compiler (analyse → link → generate)

Implementation of [DESIGN.md](./DESIGN.md); [CONTEXT.md](../CONTEXT.md) holds the vocabulary.
[JSX-IMPLEMENTATION.md](./JSX-IMPLEMENTATION.md) keeps the per-feature checklist and progress
ledger.

```
analyseModule(input, options)                                   -> ModulePlan  (one file, pure)
linkPlans(plans, entries, specialization, resolver, complete)   -> LinkResult  (per environment + mode)
generateJsCsr(browserLinkedPlan, options)                       -> browser modules
generateJsSsr(serverLinkedPlan, options)                        -> server modules
transformModules(options)                                       -> TransformOutput (all three, one call)
```

## Layout

| path                   | contents                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema/`              | the plan model as compilable TypeScript: `shared` (scalars, `Predicate` + `foldPredicate`), `value` (payloads, edges, `Value`, `TaskBody`), `program` (`Program`, `Op`, `Prop`, `Setup`), `module-plan` (`Qrl`, envelope, `AssemblyIntent`), `linked-plan` (`LinkedModule`, delivery) |
| `analyse/`             | `analyseModule`: `ast/` (parse, binding graph, capture analysis), `normalize`, `discover`, `lower-*` (one concern per file: `lower-jsx`, `lower-element`, `lower-event`, `lower-text`, `lower-children`, `lower-array`, …), `events`, `plan`                                          |
| `link/`                | `linkPlans`, `ResolverSnapshot`, `LinkEntry`; resolution, reachability, build-constant and branch folding, stripping, hook twins, render results, content and effect batching                                                                                                         |
| `generate/`            | `generateJsSsr`, `generateJsCsr`, and what they share: module assembly (`assemble-module`), components, functions, setup, imports, QRL chunks, source assembly, `GenerateOutput`                                                                                                      |
| `transform-modules.ts` | the optimizer-shaped entry the Vite plugin calls: analyse its inputs, link them incompletely (`complete: false`), generate                                                                                                                                                            |
| `library-plan.ts`      | the neutral `.qwik-plan.json` a library build publishes and an app build links                                                                                                                                                                                                        |
| `tests/`               | schema gates, per-unit tests, and full-output file snapshots (`tests/snapshots/<name>.{ssr,csr}.snap`)                                                                                                                                                                                |

## Contracts

- Analysis is pure: one file in, one `ModulePlan` out, JSON-safe and never mutated afterwards.
  `linkPlans` copies whatever it writes, so the same plans link for both environments and a
  library plan built from them carries no environment's decisions (`link-plans.unit.ts` links a
  deep-frozen plan).
- Generators consume the `LinkedPlan` and nothing else: no re-analysis, no import resolution.
- Unsupported input throws `UnsupportedError`; invalid authored code becomes an
  `InvalidModuleError` diagnostic on a failed module. Nothing silently produces different output.
- Plan format changes bump `MODULE_PLAN_VERSION` / `LINKED_PLAN_VERSION` (`schema/shared.ts`), so a
  stale library plan is refused instead of misread.

## Workflow

Each feature lands analyse → link → generate end to end for a fixture family. The gate per fixture
is one file snapshot of the full `TransformOutput` per mode; write the failing snapshot first, then
implement until green. A refactor leaves every snapshot byte-identical; `vitest -u` regenerates from
the current pipeline, so review every snapshot diff against the fixture's intent before accepting
it.

```bash
npx tsc --noEmit -p packages/compiler/tsconfig.json
pnpm vitest run --project compiler packages/compiler/src
```

## Decided output conventions

These are decisions, not parity bugs; a differential comparison against v2 output diverges here
by design.

- Component candidates require an Uppercased name (anonymous default exports exempt). JSX left
  outside any candidate fails closed with `unsupported-runtime-jsx`, never the oxc JSX fallback.
- Child-list fragments are transparent: analysis expands them before slot assignment and reuses
  ordinary child lowering; empty fragments allocate no projection or fallback QRL.
- CSR child navigation picks the shortest path: `_first` + n×`_next` vs `_last` + m×`_prev`, ties
  preferring the front walk. A hole's target resolves together with its effect, after `setEvent`.
- CSR template placeholders: a sole hole is a single-space text node; a hole among siblings is an
  empty comment, since a text placeholder would merge with adjacent text.
- SSR output is flat: arrays of strings and reference chunks, with statics merged across element
  boundaries. An open tag ships as a `createSsrOpenTag` record only where the runtime must splice
  into it (a `useOn*` or `<Catch>` root, a runtime props object) and as `createSsrSection` for
  `<head>`/`<body>`; a computed event handler outside a record wraps its step in
  `createSsrMarkup`. An element-less root keeps the runtime's script carrier for `useOn*` events.
- SSR multi-step renders evaluate all steps eagerly, while the ambient context is still live, then
  chain `maybeThen` in authored order, so independent promises run in parallel.
- A chunk reaches a non-exported module binding through an appended alias export,
  `export { x as __qwik_x };`, and imports it back as `import { __qwik_x as x }`; module bindings
  never ride `_capturesObj._`.
- Import order in the emitted `@qwik.dev/core` line is request order, not alphabetical. Event
  handlers hoist a bare `_noopQrl` and ship only their chunk; the `.s()` mirror exists only for
  invoked segments.
- Capture placement follows payload kind: function-payload QRLs (events) carry captures in the
  reference (`.w([...])`) and read them through a `_capturesObj._` prelude; value-payload QRLs
  (expressions) take captures as chunk parameters.
- Emitted functions keep their authored sync/async shape; pending work rides the scheduler or a
  `maybeThen` return.
