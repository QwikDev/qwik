# 15 — Core runtime code that only legacy compiler output uses (2026-09-17)

Ticket: `../issues/15-core-legacy-runtime-inventory.md`. Repo read-only; all paths relative to
repo root. "Pipeline" = `packages/compiler/pipeline/{generate,words.ts,tests/snapshots}`;
"legacy" = `packages/compiler/{src,generators/js,src/snapshots}`.

## Headline

The ticket's premise ("record layer is legacy-only") no longer holds. Since Varixo's 2026-09-13
correction (memory `flat-ssr-output-target`, "flat strings WHEN POSSIBLE"), the pipeline emits
`createSsrOpenTag` records for the first root element of any component whose linker fact
`registersEvents` is true/unknown (`pipeline/generate/js-ssr.ts:318-322`, `:596-654`) AND for any
element with a runtime props object (`propsStep !== null`, `js-ssr.ts:616`). It also emits
`createSsrMarkup(step)` around dynamic event steps (`js-ssr.ts:1178-1186`) and `ctx.eventAttr` in
record mode (`js-ssr.ts:1190`). The runtime then splices `useOn*` via
`applyUseOnToSsrOutput` → `applyToFirstElement`/`appendEvent`. The headless `<script hidden>`
carrier and its `<head>` relocation are still the ONLY path for element-less `useOnDocument`/
`useOnWindow`/`useVisibleTask$` roots — the pipeline emits no static carrier (0 snapshot hits for
`script hidden`; README ledger calls it a "future slice"; JSX-IMPLEMENTATION.md:573-575 lists
headless hooks as "done so far" via this runtime path). `pipeline/README.md:255-285` ("records die
at cutover") is stale on this point.

## Inventory

Legend — pipeline: referenced by pipeline generators/words or pipeline snapshots. legacy: by legacy
src/generators or legacy snapshots. runtime: called by core/server runtime code that is not emitted
output.

| Symbol | Definition | Pipeline? | Legacy? | Runtime callers | Tests pinning | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `createSsrOpenTag` | `packages/qwik/src/core/ssr/output.ts:56` | yes — `words.ts:64`, `js-ssr.ts:650`, 8 `.ssr.snap` (setup-use-on, setup-visible-task, setup-custom-hook, custom-hook-bodies, setup-hook-qrl, setup-marker-hooks, explicit-qrl-anywhere, element-spread-props) | yes — `src/words.ts`, 104 snaps | `core/dom/slot/slot.ts:323` (`renderSsrDynamicTag`), `core/ssr/use-on.ts:45` | `core/ssr/output-writer.unit.ts`, `server/ssr-render.unit.ts:116,137` | **keep** |
| `createSsrMarkup` | `output.ts:47` | yes — `words.ts:63`, `js-ssr.ts:1178,1186`, 8 snaps (event-* / component-event-prop / mutable-qrl-event) | yes — 42 snaps | `server/ssr-render.ts:176` (`<!d=` marker), `server/ssr-script-emitter.ts:224` | `output-writer.unit.ts`, `ssr-render.unit.ts` | **keep** |
| `SsrRecordChunk.openTag` flag | `output.ts:17` | implicitly (records) | implicitly | `use-on.ts:66` (`applyToFirstElement`), `ssr-render.ts:765` (`recordOpensTag`) | via the above | **keep** |
| `SsrRecordChunk.headlessCarrier` flag | `output.ts:18` | no explicit emission; runtime sets it for pipeline output with element-less roots | no explicit emission | set `use-on.ts:45`; read `ssr-render.ts:707` | `ssr-render.unit.ts:215`, `ssr-script-emitter.unit.ts` (field in fixture) | **keep until static-carrier slice lands** |
| `materializeRecord` / `materializeEventAttr` | `core/ssr/output-writer.ts:48,62` (module-private) | needed for every record above | yes | `SsrOutputWriter.finish` | `output-writer.unit.ts:42,78` | **keep** |
| `applyUseOnToSsrOutput` | `core/ssr/use-on.ts:13`; re-exported `server/qwik-copy.ts:30` | runtime path the pipeline relies on (no emitted reference, 0 snaps) | same | `core/component/component.ts:155`, `server/ssr-render.ts:304` | `ssr-render.unit.ts:215`, `core/tests/use-on.spec.tsx`, `visible-task.spec.tsx` (behaviour) | **keep** — this is the memory-note "record path" for `useOn*` |
| `applyToFirstElement` / `appendEvent` | `use-on.ts:51,80` (module-private) | runtime splice into pipeline's `createSsrOpenTag` root record | same | `applyUseOnToSsrOutput` | same as above | **keep** |
| headless carrier build (`<script hidden` in `use-on.ts:23-48`) | `use-on.ts:23` | runtime fallback for pipeline element-less roots (pipeline sets `hookEvents` only when `body.ops[0]` is an Element) | same | `applyUseOnToSsrOutput` | `ssr-render.unit.ts:215` | **keep until static carrier emission**; delete together with `relocateHeadlessCarriers` then |
| `relocateHeadlessCarriers` + `isHeadlessCarrierOutput` + `removeHeadlessCarriers` + `insertAfterElement` + `hasElement` | `server/ssr-render.ts:681-760` | runtime, `html` container only | same | `ssr-render.ts:307` | `ssr-render.unit.ts:215` | **keep until static carrier emission** |
| `recordOpensTag` | `ssr-render.ts:763` | used only by the relocation helpers above | same | `insertAfterElement`, `hasElement` | indirectly `ssr-render.unit.ts:215` | **delete with the carrier relocation** (falls out automatically) |
| `ctx.eventAttr` (`SsrRenderContext`) | `server/ssr-render.ts:73,253` | yes — `js-ssr.ts:754,1184,1192` (record mode), 3 snaps | yes — 30 snaps | `slot.ts:315`, `component.ts:150`, `dom-props.ts:212`, `ssr-effect.ts:415-466` | `ssr-render.unit.ts`, `ssr-effect.unit.ts` | **keep** |
| `ctx.eventAttrParts` | `ssr-render.ts:75,261` | yes — `js-ssr.ts:1190`, 83 snaps | no (0) | none | `ssr-render.unit.ts:83`, `ssr-script-emitter.unit.ts` | **keep** (pipeline-only) |
| `createSsrEventAttr`, `createSsrRootRef`, `createSsrRootRefPath`, `isSsrRecordChunk`, `isSsrEventAttrChunk`, `SsrOutputWriter` | `output.ts`, `output-writer.ts` | not emitted (0 snaps) | not emitted | server runtime (`ssr-render.ts`, `ssr-script-emitter.ts`) | `output-writer.unit.ts`, `ssr-script-emitter.unit.ts` | **keep** (runtime plumbing, exported from `core/index.ts:196-211` for the server bundle) |
| `renderSsrEvent`, `renderSsrProps` | `core/dom/effect/ssr-effect.ts` | yes — `js-ssr.ts:754,1184` | yes | — | `ssr-effect.unit.ts`, `serdes.unit.ts` | **keep** |
| `extractRenderRoots` | `packages/compiler/src/index.ts:86` (legacy `src`, oxc `parseSync`) | no pipeline equivalent (grep `renderroot|extractRender` in `pipeline/` = 0) | legacy-owned; `src/analysis.unit.ts:191-237` | consumer `qwik-vite/src/plugins/test-resume.ts:2,86` (`prepareTestSource`) | `analysis.unit.ts`, `qwik-vite/src/plugins/test-resume.unit.ts` | **keep the function, relocate**: test-resume still needs it after `src/` deletion — move to `pipeline/` (or a small standalone module) at cutover |
| test-resume hooks (`createTestResume`, `transformPipelineModules` compat) | `qwik-vite/src/plugins/test-resume.ts` | pipeline via compat `transformPipelineModules` | `transformModules` alias only | `qwik-vite/src/plugins/vite.ts:133,549-597`; core side `packages/qwik/src/testing/resume-session.ts:42-45` (`@qwik.dev/core/testing/{resume,importer,target,compiled}` symbols), `core/test-utils.ts:22`; `vitest.config.ts:12-44` (`csr`/`resume`/`ssr` projects) | `test-resume.unit.ts`, `testing/resume-session.unit.tsx` | **keep**; only the import path changes when `src/index.ts` goes |
| `QwikSsrPlan` / `linkSsrPlan` / `q-ssr-plan.json` | `packages/compiler/src/plan-ssr.ts`, `src/index.ts` | no (0) | legacy v0 plan | none in `packages/qwik/src`; consumers are `qwik-vite/src/plugins/ssr-plan.ts` (whole file), `vite.ts:236-241,759-778`, `plugin.ts:157,405,1210-1224,1424-1438,1846` (`ssrPlan` option), `e2e/qwik-e2e/native-{build,serve}.ts`, `compiler/specs/01,08` | none in core | **delete at cutover** (qwik-vite + e2e scripts + specs, not core) |
| `idBase` / seed parameter | `packages/compiler/src/plan-ssr.ts:32-732` only | no (0; `useId` is a runtime counter, JSX-IMPLEMENTATION.md:589) | legacy plan only (7 src, 4 gen/js, 2 snaps) | none in `packages/qwik/src` (`jsx-generated.ts:1152 seed?` is the HTML attr) | none | **nothing in core to delete**; dies with `src/plan-ssr.ts` |
| `Each` / `Show` | removed in `4d12d05d6` (2026-07-15, "refactor: compiler rewrite": `core/control-flow/each.ts`, `each.unit.tsx`, `tests/each.spec.tsx`, `show*`) | — | — (0 snaps both sides) | none | none | **already gone**; residue: `packages/docs/src/routes/demo/component/{each,show}/index.tsx` and `docs/labs/{each,show}/index.mdx` still `import { Each, Show } from '@qwik.dev/core'` (docs drift, separate ticket) |

### Emitted-import vocabulary: legacy-only names (from diffing `import {…} from '@qwik.dev/core'` across the two snapshot sets)

`comm` of all imported names — legacy snaps import these, pipeline snaps never do:

| Name | Definition | `core/index.ts` export | Runtime callers (non-emitted) | Reason it is legacy-only | Verdict |
| --- | --- | --- | --- | --- | --- |
| `createDomBatchEffect` | `core/dom/effect/effect.ts:185` | `:371` | 0 | pipeline emits per-prop effects | **delete at cutover** (fn + export) — `effect.unit` pins it, drop test |
| `patchTextValue` | `core/dom/effect/text-effect.ts:64` | `:385` | 0 | pipeline uses `_textValue` | **delete at cutover** |
| `getPropSource`, `getMemberSource` | `core/component/props.ts:37,79` | `:315-316` | 0 | pipeline uses `propSource`/`computedProp` | **delete at cutover** |
| `getStoreSource` | `core/reactive/store.ts:108` | `:188` (public API) | 2 | public store API, legacy also emitted it | **keep** |
| `readExpression`, `readTrackedSourceValue` | `core/utils/qrl.ts:18`, `text-effect.ts:82` | `:321,386` | 2 each | still in `pipeline/words.ts:46,51` (`ReadExpression`, `ReadTrackedSourceValue`) even though no snapshot emits them | **keep** (pipeline vocabulary); verify the words are live, else prune |
| `renderDomPropsToString` | `core/dom/effect/dom-props.ts:190` | `:393` | 2 (`slot.ts`, `ssr-effect.ts`) | legacy emitted it directly; pipeline goes through `renderSsrProps` | **keep fn, drop index export** at cutover |
| `createVisibleTaskHandlerQrl` | `core/handlers.ts:54` | `:453` | 1 (`core/runtime/task.ts:232`) | pipeline emits `useVisibleTaskQrl`; the handler QRL is now created by the runtime | **keep fn, drop index export** at cutover |
| `getActiveInvokeContext` | `core/runtime/invoke.ts` | `:244` | many | pipeline emits `getActiveInvokeContextOrNull` | **keep** |
| `createSuspense`, `createSsrSuspense`, `createRevealGroup`, `Suspense`, `Reveal`, `useAsync$`/`useAsyncQrl`, `useServerData` | `core/dom/content/{content,suspense-ssr,reveal}.ts`, `reactive/public-api.ts:107`, `runtime/use-server-data.ts:8` | yes | 0-1 | pipeline group 13 (`JSX-IMPLEMENTATION.md:602-607`) not landed — pending slice, not dead code | **keep** (unclear until group 13 decides which runtime entry points it lowers to) |

Not legacy-only, listed for completeness: pipeline-only emitted names (`_textValue`, `_prev`,
`_last`, `propSource`, `computedProp`, `readTrackedValue`, `renderSlotContent`,
`renderSsrSlotContent`, `serializeAttrExpressionValue`, `forwardSlot`, `useChildrenInfo`,
`createCapturedEvent`, `_qrlSync`, `sync$`, `implicit$FirstArg`, `getLocale`, `qrl`, `isSource`,
`Fragment`, `_EMPTY_OBJ`, `componentQrl`, `useVisibleTaskQrl`) — all stay.

`SsrRenderContext` methods: pipeline output calls `addRoot`, `nextId`, `eventAttrParts`, `setRef`,
`eventAttr`, `contextScopeRef`, `scheduler`; legacy output calls the same minus `eventAttrParts`
plus `document` (CSR). `wrapRange`/`createRangeScope`/`defer`/`inOrder`/`flush`/`syncFn` are
runtime-only (`core/dom/content/suspense-ssr.ts:48-118`, `ssr-render.ts`) — none is
emission-specific. Nothing in `packages/qwik/src/server/index.ts` (`renderToString`,
`renderToStream`, `resolveManifest`, `versions`, `getQwikLoaderScript`, `setServerPlatform`) is
legacy-only.

Emission-vocabulary files: legacy `packages/compiler/src/words.ts` (`QwikWord` enum incl.
`CreateSsrOpenTag`/`CreateSsrMarkup`/`CreateDomBatchEffect`/`PatchTextValue`/`GetPropSource`/
`GetMemberSource`/`CreateVisibleTaskHandlerQrl`/`RenderDomPropsToString`) dies with `src/`;
pipeline `packages/compiler/pipeline/words.ts` is the survivor. There is no words/vocabulary file in
`packages/qwik/src` (checked `core/shared/`, `find -iname '*word*'`); core's vocabulary is
`core/index.ts` exports.

## Sources

- `packages/compiler/pipeline/generate/js-ssr.ts:318-322, 596-654, 1125-1200` — record decision
  (`hookEvents`, `propsStep`), `createSsrOpenTag`/`createSsrMarkup`/`eventAttr(Parts)` emission.
- `packages/compiler/pipeline/link/link-hooks.ts:115,188,205` — `registersEvents` fact.
- `packages/compiler/pipeline/words.ts:46-64`; `packages/compiler/src/words.ts`.
- `packages/qwik/src/core/ssr/{output,use-on,output-writer}.ts`; `server/ssr-render.ts:60-110,
  240-320, 670-790`; `core/dom/slot/slot.ts:293-330`; `core/component/component.ts:138-169`.
- `packages/qwik-vite/src/plugins/{test-resume,ssr-plan,vite,plugin}.ts`;
  `packages/compiler/src/index.ts:86` (`extractRenderRoots`).
- `packages/compiler/pipeline/README.md:255-285` (FLAT SSR OUTPUT ledger; stale on "records die");
  `packages/compiler/pipeline/JSX-IMPLEMENTATION.md:567-590, 602-607`.
- Memory `flat-ssr-output-target` (2026-09-13 correction: reuse record path for `useOn*`).
- `git show 4d12d05d6 --stat` (Each/Show removal).
