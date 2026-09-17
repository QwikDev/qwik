# Cutover prerequisites: acceptance sweep and render-root port sizing
Type: research
Status: resolved
Blocked by:

## Question

Two facts the cutover bar depends on. (1) Acceptance sweep: run the pipeline per-module
`transformModules` (`pipeline/compat/transform-modules.ts`) over every `.tsx`/`.jsx` under
`e2e/**/apps`, `e2e/**/src`, `packages/docs/src`, `packages/insights/src`, `starters/` in SSR and
CSR mode; report reject counts by diagnostic/error message and by directory (the 2026-09-08
baseline was 103 of 431 e2e files rejected). (2) `extractRenderRoots` in `src/extract.ts`
(1489 lines) depends on legacy `analysis.ts`; the pipeline resume harness needs it. Report what
it does, which legacy facts it uses, and which pipeline facts (`BindingGraph`, `JsxAnalysis`,
`discoverComponents`, `returns-jsx`) cover each, to size the port.

## Answer

1. Sweep (911 files, SSR+CSR, `transformModules` per file, Prod mode): 865 accepted clean, 12 accepted with diagnostics, 34 thrown (3.7%); e2e is 9 of 436 rejected vs the 103 of 431 baseline. SSR/CSR agree on 910/911 (`use-theme.tsx`, a hook-only module, throws `imports/hoists without a component` on SSR only).
2. Top rejections: `more than one component parameter` 16 (15 are `insights/src/components/icons/*` with `(props, key)`), `RangeError` stack overflow 4 (`link/render-results.ts` `evaluate`/`readBinding` cycle on `x.value = x.value.filter(...)` — the only real bug), non-QRL component handler 2, branch arm capturing a local component 2, early return in a collection row 2, plus 7 singletons.
3. Silent pass-through (`component$(` left verbatim, no diagnostic): `factory/utils.tsx` (component$ inside a plain function), 6 components in `slot.tsx` (runtime `jsx()` loop), 2 in `suspense.tsx`; `useResource$`/`event$`/`sync$` are emitted with a QRL argument but keep the `$` callee. No `routeLoader$` survives outside comments.
4. `extractRenderRoots` is in `src/index.ts:76-293` (~215 lines), not `extract.ts`, and uses **no** legacy `analysis.ts`/`words.ts` facts — only `oxc-parser.parseSync` and a duck-typed AST walk; consumer is `qwik-vite/src/plugins/test-resume.ts:84-104` (rewrites `render(X)` args to imports of a synthetic per-scope module).
5. Pipeline counterparts: `analyse/ast/parse.ts` `parseModule` (1:1), `BindingGraph.calls/parentOf/declaration/freeReferences/dependenciesOf` replace the ancestor walk + name-based reachability; `JsxAnalysis`/`discoverComponents`/`returns-jsx`/`module-surface` are not needed. Port ≈ 150-200 lines (floor: move as-is, ~0 new logic).
6. Pinned by `src/analysis.unit.ts:175-244` (4 cases, move with it) and end-to-end by the `csr/resume/ssr` vitest projects via `vite.ts:597`; `test-resume.unit.ts` does not touch root extraction.

