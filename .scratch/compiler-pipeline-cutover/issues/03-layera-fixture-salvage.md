# Which layerA fixtures are worth porting as pipeline snapshot fixtures
Type: research
Status: resolved
Blocked by:

## Question

`conformance/layerA/fixtures` holds 58 `input.tsx` cases (with `request.json`, `expected/`).
`pipeline/tests/snapshots.unit.ts` already drives 434 snap files. Which layerA inputs cover a
construct no pipeline fixture covers? Output a table: fixture → construct → existing pipeline
fixture that already covers it (or "none"). Also list layerA inputs the pipeline currently
rejects (run `transformModules` from `pipeline/compat` on each).

## Answer

- Findings: `research/03-layera-fixture-salvage.md` (fixture→construct→covering-snapshot table, reject table, salvage list).
- 55/58 layerA inputs are accepted by `pipeline/compat/transform-modules.ts` with zero diagnostics, identically in SSR and CSR; 3 throw `UnsupportedError`: `local-component-captured` (branch arm capturing a local component, `analyse/ast/capture-analysis.ts:185`) and `suspense-inline`/`suspense-stream` (async component function, `analyse/discover.ts:87`).
- 8 more are silent pass-throughs: the 7 `jsx-call-*` fixtures keep `jsx()`/`jsxDEV()` calls verbatim (4 of them never even mark `App`), and `plugin-call` leaves `native$`/`nativeFrom` untouched.
- 31 inputs are already covered one-to-one by existing `snapshots.unit.ts` fixtures; not worth porting.
- Salvage (accepted, uncovered): e7-unary, e6-index-read, e2-undef-text, template-text, if-setup, imported-callback (2 modules), local-component, local-component-context, local-component-slots/projected-slot, component-signal-identity, fragment-root, dynamic-tag, visible-task-static; keep local-component-captured, one suspense input, one-two jsx-call inputs and plugin-call as TODO regressions.
