# `pipeline/` — the staged compiler (analyse → link → generate)

From-scratch implementation of [DESIGN.md](./DESIGN.md). The legacy pipeline in `../src` stays
intact and untouched as the **differential oracle** until the cutover commit deletes it.

```
analyseModule(file, options)                         -> ModulePlan  (one file, one plan, pure)
linkPlans(plans, entries, specialization, snapshots) -> LinkedPlan  (per environment + mode)
generateJsCsr(browserLinkedPlan, options)            -> browser modules
generateJsSsr(serverLinkedPlan, options)             -> server modules
```

## Layout

| path        | contents                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN.md` | the authoritative design: model rationale, rules, phases, verification                                                                                                                                                                                                                                                                                            |
| `schema/`   | the plan model as compilable TypeScript — `shared` (scalars, `Predicate` + `foldPredicate`, `Maybe`), `value` (payloads, edges, `Value`, `TaskBody`), `program` (`Program`, `Op`, `Prop`, typed `Invoke`/`Setup`), `module-plan` (`Qrl`, declarations, envelope, `AssemblyIntent`), `linked-plan` (materialized `LinkedModule`s, delivery, implementations table) |
| `analyse/`  | `analyseModule` — pure, no batch registries; one concern per file like the ts-optimizer (PR #8872): `ast/` (types, parse, walkers, capture-analysis, jsx-text), `normalize`, `discover`, `lower-context`, `lower-jsx`/`lower-event`/`lower-hole`, `events`, `plan`                                                                                                |
| `link/`     | `linkPlans` + `ResolverSnapshot`/`PluginSnapshot`/`LinkEntry`; `complete` flag semantics                                                                                                                                                                                                                                                                          |
| `generate/` | `generateJsSsr` (baseline), `generateJsCsr`; `GenerateOutput`                                                                                                                                                                                                                                                                                                     |
| `compat/`   | `transformModules` wrapper (hostless snapshots, `{kind:'module'}` roots)                                                                                                                                                                                                                                                                                          |
| `tests/`    | schema gates, flow smoke, per-unit tests, and full-output file snapshots (`tests/snapshots/`, `test.todo` per pending slice)                                                                                                                                                                                                                                      |

## Current state

Golden coverage (SSR + CSR full-`TransformOutput` file snapshots seeded from the legacy oracle) spans: foreign
passthrough; static components (all supported declaration forms, attrs, void tags, JSX text,
sibling statements, generated-name allocation, authored param reuse); element event handlers
(QRL identity, chunks, `_noopQrl` hoists, `setEvent` wiring); dynamic text holes (invoked-segment
mirrors + `.s()`, `q:id`, `renderSsrTextExpression`/`maybeThen`, CSR placeholder templates +
`createTextExpressionEffect`); `useSignal` setup + signal-read holes (subscription, no QRL);
event handlers capturing signal locals (`.w([count])` SSR wrapper, `setEvent` captures arg,
`_captures` chunk prelude, rust `QrlValue.captures`); the counter (event + signal-read hole
composed on one element); text holes with sibling children (SSR range targets + `<!t>`/`<!/t>`
markers, CSR `<!---->` comment placeholder + marker swap, shortest-path child navigation);
holes in nested elements (recursive SSR emission with per-element ids/markers, recursive
CSR template placeholders + level-composed locator paths); dynamic attributes (`renderSsrAttr`/
`renderSsrAttrExpression` steps with the null/bare/quoted ternary, CSR `createAttrEffect`/
`createAttrExpressionEffect` against the element, shared `lowerExpressionValue` classification
with per-attr segment identity). Expressions lower to ValueIR when the
vocabulary covers them (JS payload fallback), so Rust evaluates text holes natively; only
IR-uncoverable expressions refuse on the native target. The linker is still a 1:1 materializer — folding, policies, and edges
pending. Everything unsupported throws `UnsupportedError`; invalid authored code becomes
`InvalidModuleError` diagnostics.

## Workflow (vertical slices — DESIGN.md "Phases")

Each slice implements analyse → link → generate end-to-end for a fixture family. Per fixture the gate is one
file snapshot of the full `TransformOutput` PER MODE (`tests/snapshots/<name>.{ssr,csr}.snap`),
SEEDED from the legacy oracle (`../src`) while it exists — write the failing snapshot first, implement until green.
The rust target is REMOVED for iteration speed (git history has `generate/rust-ssr.ts` +
its crate goldens through eb9287f79): examples implement `generateJsSsr` + `generateJsCsr` only;
a later dedicated pass reintroduces the rust generator and recaptures crate bytes per family.
`vitest -u` regenerates from the STAGED pipeline, so review every snapshot diff against the
fixture's intent (and the oracle, until cutover) before accepting. No reverse adapter, no feature
flag: once the fixture corpus is covered the switch is a hard cutover commit.

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

- Seed snapshot bytes from a LIVE legacy run — never from the prettier snapshots in
  `../src/snapshots` (those are formatted, not raw output).
- Import order in the emitted `@qwik.dev/core` line is REQUEST order, not alphabetical.
- Static component text: whole-declaration rewrite via `emit-component.ts` forms; static text is
  NOT escaped, attrs go through `escapeAttr`; `<br/>` → `<br>`; `JSON.stringify` quoting.
- Segment naming: FNV-1a over `${scope}\0${path}` identity (`../src/segment-identity.ts`) — port
  byte-for-byte, verify hashes against captured oracle output.
- The `.s()` mirror hoist exists only for INVOKED segments (render expressions); event handlers
  hoist the bare `_noopQrl` and ship the chunk only.
- Element text targets: sole hole child → element target; siblings → range targets + `<!t>`
  markers with a per-element marker counter.
- Multi-step renders (LEGACY ONLY — see the divergence ledger): legacy defers later steps into
  `invoke(invokeCtx, …)` thunks; the staged pipeline evaluates all steps eagerly instead.
- Capture placement follows payload kind: Function-payload QRLs (events) carry captures in the
  reference (`.w([...])`, `setEvent` 4th arg, rust `QrlValue.captures`) and read them via a
  `_captures` chunk prelude; Value-payload QRLs (expressions) take captures as chunk params and
  keep `QrlValue.captures` empty.
- When an authored core import is replaced in place, a chunk-import block ends with a blank line
  before module-top hoists; a lone core import does not.
- CSR template placeholders: a sole hole is a single-space TEXT node (bindable directly); a hole
  among siblings must be an empty COMMENT — a text placeholder would merge with adjacent text
  runs. The locator counts child OPS; adjacent text statics (a dropped comment between text
  runs) would miscount — unhandled until that fixture exists.
- Rust child placement follows the props: with dynamic props, ALL children (holes included)
  pre-render into a `children_N` buffer BEFORE the open tag; a hole on a prop-less element emits
  inline after `>`. CSR orders per element: node lookups, then `setEvent`, then effects.

## Deliberate divergences from the legacy oracle

- Component candidates require an Uppercased name (anonymous default exports exempt). The legacy
  compiler has no such rule — a differential fixture with a lowercase-named component will
  diverge; that is this decision, not a parity bug.
- Candidate detection is the routing gate; JSX left outside any candidate fails closed with
  `unsupported-runtime-jsx` (NEVER the oxc fallback — that would emit react/jsx-runtime output).
  Legacy additionally embeds function renders for JSX in call arguments — resolve when that
  fixture family lands.
- CSR child navigation picks the SHORTEST path: `_first`+n×`_next` vs `_last`+m×`_prev`, ties
  preferring the front walk. Legacy only ever front-walks, so fixtures with a long front path
  diverge from legacy bytes by design.
- CSR emits a hole's target resolution together with its effect, after `setEvent` wiring. Legacy
  splits them around `setEvent` (lookups first) — same behavior, one call site; the counter's
  csr snapshot is regenerated from the staged pipeline accordingly.
- FLAT SSR OUTPUT (landed 2026-08-26, staged only — legacy ignored, records die at cutover):
  staged SSR emits flat arrays of strings + reference chunks; no `createSsrOpenTag`/
  `createSsrMarkup`. Events emit `ctx.eventAttrParts(name, qrlRef)` — a string/ref parts array,
  `[]` when there are no handlers (attribute elision). Statics merge across element boundaries.
  `useOn*` (future slice): the compiler statically merges hook events into the ROOT element's
  event attr (analysis sees hooks — unconditional setup + capability closure); a `<script>`
  carrier is emitted only for element-less roots. No runtime slots, no post-render surgery: the
  legacy record machinery (`applyToFirstElement`/`appendEvent`, `recordOpensTag`, headless
  carriers, `materializeRecord`) serves only legacy-compiled output and is deleted at cutover.
- SSR multi-step renders evaluate ALL steps eagerly (before the first await, ambient context
  still live), then chain `maybeThen` in authored order — promises run in parallel. Legacy
  defers later steps into `invoke(invokeCtx, …)` thunks; that machinery exists only to restore
  the context its own deferral kills, and is deliberately not ported. Revisit only if a step
  ever needs a PRIOR step's result as input. Marker locators walked from the element stay valid
  across `replaceWith` swaps (positions are preserved), so per-hole emission needs no
  resolve-all-markers-first phase; the multi-hole snapshots are staged-authored under this
  ledger entry, not oracle-seeded.
- QRL extraction conventions follow the ts-optimizer (PR #8872) / rust optimizer, not legacy
  `src`: a chunk reaches a non-exported module binding via an appended
  `export { x as _auto_x };` alias and `import { _auto_x as x }` in the chunk — never via
  `_captures`. Legacy's bare `export { x }` is its own drift; diverge from it on this fixture
  family.
- `useOnDocument$`/`useOnWindow$`/element-less `useVisibleTask$` carriers are emitted STATICALLY
  when that slice lands: hook presence is always compile-time knowledge (hooks are unconditional
  setup statements; custom hooks resolve via the linker capability closure), and a
  `<script hidden q-d:…>` is valid in any parent, so the generators emit it inline in the
  component's own markup (SSR bytes + CSR template — re-renders recreate it). No runtime
  splicing, no head relocation: legacy's `applyToFirstElement`/`headlessCarrier`/
  `relocateHeadlessCarriers` machinery existed only because a runtime-invented, unmanaged node
  had to survive re-renders, and it dies at cutover (taking the `openTag` record flag's last
  consumer with it).

## Pending prerequisites from DESIGN.md Phase 0 (not yet done)

- CSR golden suite over all 58 conformance fixtures (whole `GenerateOutput` shape).
- `tsconfig.check.json` for the compiler + a qwik-vite check config including unit/spec files —
  verify green before relying on them.
- Widen e2e `testMatch` so the three excluded Router `.spec.ts` files run; e2e end state is zero
  failures with `--fail-on-flaky-tests`.
- `ValueIR` gains its `build-constant` leaf in `../src/expr-ir.ts` with the first slice that
  folds IR (`schema/value.ts` notes this).
