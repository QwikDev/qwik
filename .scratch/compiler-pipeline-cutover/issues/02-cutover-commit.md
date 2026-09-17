# Contents and bar of the cutover commit
Type: grilling
Status: resolved
Blocked by:

## Question

Exact delete list and swap list for the commit that removes legacy. Candidates: `src/**`,
`generators/**`, `conformance/layerA`, `specs/01,02,03,07,08,09`, `REQUIREMENTS.md`,
`specs/TODO.md`, `PLAN.md`, `TARGET_NATIVE_HANDOFF.md`, `JSX_TRANSFORM.md`,
`qwik-vite/src/plugins/ssr-plan.ts`, `linkSsrPlan`/`extractRenderRoots` exports, root scripts
`build.native`/`serve.native`, `playwright.native.config.ts`, `native-serve.ts`,
`packages/qwik/native/**`, `.github` `test-native`, and the core runtime list from ticket 15 (note: research 15 found the record layer and headless carriers are still used by pipeline output — keep them; only four core symbols are dead).
Swap: `plugin.ts` `transformCompilerModules` → pipeline `transformModules` (compat wrapper).
Package surface after: does `src/index.ts` disappear and `pipeline/index.ts` become `main`?
Bar: which suites define "no regression" (record their counts the day before).

## Answer

Resolved 2026-09-17 (Varixo accepted the recommended answers; research 15 and 16 corrected the premises).

**Shape**: a series on one branch, each step green, merged as one PR; no flag at any point.
1. Ticket 01 moves (legacy imports absorbed, eslint guard).
2. `extractRenderRoots` moves from `src/index.ts` into the pipeline with its 4 `analysis.unit.ts` cases (straight move, `parseSync` → `parseModule`).
3. `plugin.ts` flips to the pipeline `transformModules`; delete list applied.
4. `git mv pipeline src`; docs, memory notes and paths updated.

**Delete list**: `packages/compiler/src/**` (except what step 2 moved), `generators/**`, `conformance/layerA/**`,
`specs/01,02,03,07,08,09`, `specs/TODO.md`, `REQUIREMENTS.md`, `PLAN.md`, `TARGET_NATIVE_HANDOFF.md`, `JSX_TRANSFORM.md`,
`qwik-vite/src/plugins/ssr-plan.ts` + the `ssrPlan` option/collector in `plugin.ts`/`vite.ts`, `packages/qwik/native/**`,
root scripts `build.native`/`build.native.apps`/`serve.native`/`start.native`, `e2e/qwik-e2e/native-build.ts`,
`native-serve.ts`, `playwright.native.config.ts`, CI jobs `test-native`/`save-native-cache`/`check cache: native engine`
and their cache keys. Core dead code from research 15: `createDomBatchEffect`, `patchTextValue`, `getPropSource`,
`getMemberSource` (+ two stray index exports). Record layer and headless carriers stay. Keep `conformance/layer0`.

**Surface after**: flat exports from `src/index.ts`: `transformModules` (host entry), `analyseModule`, `linkPlans`,
`generateJsSsr`, `generateJsCsr`, `createLibraryPlan`, `readLibraryPlan`, schema types, `extractRenderRoots`.
`linked-build.ts` drops the `pipeline` namespace. Vite entry, tsconfig aliases and `include` unchanged.

**Bar**: record the day before and require no regression: `vitest run packages` (core corpus csr/resume/ssr + pipeline),
`test.e2e.chromium`, `test.e2e.qwik-react`, `tsc.check`, `build.full`. Acceptance sweep (research 16 script): zero
rejects over e2e app sources in SSR and CSR before step 3; docs/insights rejects get a listed allowance. Prerequisites
surfaced: fix the `render-results` recursion overflow (diagnostic or fixpoint) and decide the silent `component$`
non-extraction (both on the map as fog). Docs' `Each`/`Show` imports are out of this map.

Amendment (ticket 22): the series gains a step before the flip: the Suspense port from ticket 08, so `suspense.tsx` compiles under the diagnosed shapes.
