# Core runtime code that only legacy compiler output uses
Type: research
Status: resolved
Blocked by:

## Question

List every symbol in `packages/qwik/src` (core + server) that exists only for legacy compiler
output or the old SSR plan: record layer (`createSsrOpenTag`, `createSsrMarkup`,
`materializeRecord`, `materializeEventAttr`, `applyToFirstElement`, `appendEvent`,
`recordOpensTag`, headless carrier relocation), `extractRenderRoots`/test-resume hooks,
`q-ssr-plan` consumers, `idBase`/seed remnants, `Each`/`Show`. For each: file, whether the
pipeline output still uses it (grep pipeline snapshots and generators), and the tests that pin
it. Note the `useOn*` record path that the pipeline deliberately still uses (keep).

## Answer

Findings: `../research/15-core-legacy-runtime-inventory.md`.

1. The record layer is NOT legacy-only: the pipeline emits `createSsrOpenTag` for `useOn*` roots (`registersEvents` fact) and spread-props elements, `createSsrMarkup` for dynamic event steps, and `ctx.eventAttr` in record mode (`pipeline/generate/js-ssr.ts:318-322,596-654,1178-1192`); `applyUseOnToSsrOutput`/`applyToFirstElement`/`appendEvent`/`materializeRecord`/`materializeEventAttr` all serve it — keep. `createSsrOpenTag` also has a runtime caller (`renderSsrDynamicTag`, `slot.ts:323`).
2. Headless `<script hidden>` carrier + `relocateHeadlessCarriers`/`recordOpensTag` (`use-on.ts:23-48`, `ssr-render.ts:681-770`) are the only path for element-less `useOnDocument/Window/useVisibleTask$` roots (pipeline emits no static carrier, 0 snapshots) — keep until that slice lands; `pipeline/README.md:255-285` is stale on "records die at cutover".
3. Genuinely legacy-only core code (0 runtime callers, absent from pipeline vocabulary): `createDomBatchEffect` (`effect.ts:185`), `patchTextValue` (`text-effect.ts:64`), `getPropSource`/`getMemberSource` (`props.ts:37,79`) — delete fn + `core/index.ts` export; `renderDomPropsToString` and `createVisibleTaskHandlerQrl` keep the function, drop the index export.
4. `extractRenderRoots` (`compiler/src/index.ts:86`) has no pipeline equivalent but `qwik-vite/plugins/test-resume.ts` still needs it — relocate, don't delete. `QwikSsrPlan`/`q-ssr-plan.json`/`idBase` touch nothing in `packages/qwik/src` (consumers: qwik-vite `ssr-plan.ts`, `vite.ts`, `plugin.ts` `ssrPlan` option, `e2e/qwik-e2e/native-*.ts`) — delete there.
5. `Each`/`Show` were already removed in `4d12d05d6` (2026-07-15); only `packages/docs` demo/labs pages still import them (docs drift). `Suspense`/`Reveal`/`useAsync`/`useServerData` are legacy-only in emission because pipeline group 13 has not landed — unclear, not dead.
