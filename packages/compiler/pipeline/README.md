# `pipeline/` — the staged compiler (analyse → link → generate)

From-scratch implementation of [DESIGN.md](./DESIGN.md). The legacy pipeline in `../src` stays
intact and untouched as the **differential oracle** until the cutover commit deletes it.

```
analyseModule(file, options)                         -> ModulePlan  (one file, one plan, pure)
linkPlans(plans, entries, specialization, snapshots) -> LinkedPlan  (per environment + mode)
generateJsCsr(browserLinkedPlan, options)            -> browser modules
generateJsSsr(serverLinkedPlan, options)             -> server modules
generateRustSsr(serverLinkedPlan, entry, options)    -> native project sources
```

## Layout

| path        | contents                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN.md` | the authoritative design: model rationale, rules, phases, verification                                                                                                                                                                                                                                                                                            |
| `schema/`   | the plan model as compilable TypeScript — `shared` (scalars, `Predicate` + `foldPredicate`, `Maybe`), `value` (payloads, edges, `Value`, `TaskBody`), `program` (`Program`, `Op`, `Prop`, typed `Invoke`/`Setup`), `module-plan` (`Qrl`, declarations, envelope, `AssemblyIntent`), `linked-plan` (materialized `LinkedModule`s, delivery, implementations table) |
| `analyse/`  | `analyseModule` — pure, no batch registries                                                                                                                                                                                                                                                                                                                       |
| `link/`     | `linkPlans` + `ResolverSnapshot`/`PluginSnapshot`/`LinkEntry`; `complete` flag semantics                                                                                                                                                                                                                                                                          |
| `generate/` | `generateJsSsr` (baseline), `generateJsCsr`, `generateRustSsr`; `GenerateOutput`                                                                                                                                                                                                                                                                                  |
| `compat/`   | `transformModules` wrapper (hostless snapshots, `{kind:'module'}` roots)                                                                                                                                                                                                                                                                                          |
| `tests/`    | schema gates + flow smoke (green) + differential-oracle harness (`test.todo` per slice)                                                                                                                                                                                                                                                                           |

## Current state: mocked stages, full flow wired

The whole flow runs end to end today: `transformModules` → analyse → link(incomplete,
module entries) → `generateJsSsr`/`generateJsCsr`. What is real vs mocked:

- **Schema**: complete per DESIGN.md, compiles, JSON round-trips (`tests/schema.unit.ts`).
  String-literal unions from the design are `const enum`s (repo convention, cf. `QwikWord`,
  `SsrOpKind` in `../src`); enum values keep the design's exact wire strings, so serialized
  plans are unchanged.
- **analyse**: MOCK — parses (oxc), fails loudly on parse errors, otherwise everything becomes
  `kind: 'foreign'` (authored source). Slice 1 replaces this with component/QRL lowering; use
  `SliceUnsupportedError` for anything a slice cannot lower yet — never silently wrong output.
- **link**: MOCK — 1:1 materialization into `LinkedModule`s, entry resolution, `complete` failure
  semantics. No folding/policies yet.
- **generateJsSsr**: foreign modules transpile through oxc exactly like the legacy fallback
  (already byte-parity — see the live oracle test); qwik modules throw.
- **generateJsCsr / generateRustSsr**: precondition-enforcing stubs (slice 2 / slice 5).

## Workflow (vertical slices — DESIGN.md "Phases")

Each slice implements analyse → link → generate end-to-end for a fixture family and must match
the oracle's full `TransformOutput` field-by-field before the next slice starts. No reverse
adapter, no feature flag: after complete differential parity the switch is a hard cutover commit.

Slice gates, always:

```bash
pnpm build.compiler                                          # oracle fixtures load dist
npx tsc --noEmit -p packages/compiler/tsconfig.json          # includes pipeline/
pnpm vitest run packages/compiler/pipeline                   # schema + flow + oracle harness
pnpm vitest run packages/compiler                            # legacy suites stay green
```

Schema gates per slice: JSON round-trip, deep-freeze, shuffled-batch determinism, and generation
from a deserialized frozen plan in a fresh process.

## Parity traps learned from the oracle (keep for slice 1)

- The oracle runs LIVE in the differential tests — never reverse-engineer bytes from prettier
  snapshots in `../src/snapshots` (those are formatted, not raw output).
- Import order in the emitted `@qwik.dev/core` line is REQUEST order, not alphabetical.
- Static component text: whole-declaration rewrite via `emit-component.ts` forms; static text is
  NOT escaped, attrs go through `escapeAttr`; `<br/>` → `<br>`; `JSON.stringify` quoting.
- Segment naming: FNV-1a over `${scope}\0${path}` identity (`../src/segment-identity.ts`) — port
  byte-for-byte, verify hashes against captured oracle output.
- The `.s()` mirror hoist exists only for INVOKED segments (render expressions); event handlers
  hoist the bare `_noopQrl` and ship the chunk only.
- Element text targets: sole hole child → element target; siblings → range targets + `<!t>`
  markers with a per-element marker counter.
- Multi-step renders: first step eager, later steps are `invoke(invokeCtx, …)` thunks with lazy
  `??=` id claiming; the value chains nested `maybeThen`.

## Pending prerequisites from DESIGN.md Phase 0 (not yet done)

- CSR golden suite over all 58 conformance fixtures (whole `GenerateOutput` shape).
- `tsconfig.check.json` for the compiler + a qwik-vite check config including unit/spec files —
  verify green before relying on them.
- Widen e2e `testMatch` so the three excluded Router `.spec.ts` files run; e2e end state is zero
  failures with `--fail-on-flaky-tests`.
- `ValueIR` gains its `build-constant` leaf in `../src/expr-ir.ts` with the first slice that
  folds IR (`schema/value.ts` notes this).
