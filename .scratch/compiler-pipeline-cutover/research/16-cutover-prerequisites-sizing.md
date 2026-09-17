# Cutover prerequisites: acceptance sweep and render-root port sizing

Ticket: `.scratch/compiler-pipeline-cutover/issues/16-cutover-prerequisites-sizing.md`
Date: 2026-09-17

## Method (part 1)

- Inputs: every `.tsx`/`.jsx` under `e2e/`, `packages/docs/src`, `packages/insights/src`, `starters/`
  (skipping `node_modules`, `dist`, `.native`, `lib`, `server`, `build`): **911 files**.
- Driver: `transformModules` from `packages/compiler/pipeline/compat/transform-modules.ts`, one
  call per file, `isServer: true` and `isServer: false`, options as in
  `pipeline/tests/snapshots.unit.ts:22-33` (`srcDir: 'src', transpileTs, transpileJsx, sourceMaps:
  false`, no `mode` → `BuildMode.Prod`, the same as `flow.unit.ts:51-60`). Path = repo-relative.
- Script: scratchpad `zz-sweep-tmp.unit.ts` placed temporarily at
  `packages/compiler/pipeline/tests/`, run with `npx vitest run --root . <file>` from the repo root,
  deleted afterwards (`git status` shows only `.scratch/`). Raw results: scratchpad `sweep.json`
  (1.3 MB), aggregation `analyze.mjs`, per-file probe `probe.txt`. Wall time ≈ 12 s for 1822 runs.
- "Rejected" = `transformModules` threw. "Diag" = returned with ≥1 diagnostic (all are
  `category: error`; the module still emits). "Leftover" = emitted code still matches
  `/\b\w+\$\(/` — then checked by hand (section 1.4).

## 1.1 Totals per directory root

| root | files | accepted, 0 diags | accepted with diags | rejected (thrown) | leftover `$(` |
| --- | ---: | ---: | ---: | ---: | ---: |
| e2e/adapters-e2e | 14 | 14 | 0 | 0 | 0 |
| e2e/qwik-e2e | 411 | 397 | 5 | 9 | 5 |
| e2e/qwik-react-e2e | 11 | 11 | 0 | 0 | 0 |
| packages/docs | 343 | 329 | 4 | 10 | 8 |
| packages/insights | 62 | 44 | 3 | 15 | 1 |
| starters/adapters | 11 | 11 | 0 | 0 | 0 |
| starters/apps | 22 | 22 | 0 | 0 | 0 |
| starters/features | 37 | 37 | 0 | 0 | 1 |
| **all** | **911** | **865 (95.0%)** | **12** | **34 (3.7%)** | 15 (5 real, see 1.4) |

Against the 2026-09-08 baseline (103 of 431 e2e files rejected): e2e is now **9 of 436 rejected**
(2.1%), plus 5 with diagnostics.

**SSR vs CSR agree on 910 of 911 files** (same status and same diagnostic set). The one
disagreement: `e2e/qwik-e2e/apps/preloader-test/src/components/generated/use-theme.tsx` — a
module whose only content is a custom hook `useTheme` (no component) with a `useVisibleTask$` +
many `useTask$` calls. SSR throws `Error: pipeline: imports/hoists without a component`
(`pipeline/generate/assemble-module.ts:186`, via `js-ssr.ts:103`); CSR accepts it (11 modules).

## 1.2 Rejection reasons (thrown), all 34, SSR

| n | error | example files |
| ---: | --- | --- |
| 16 | `UnsupportedError: pipeline does not support: more than one component parameter` | `packages/docs/src/routes/demo/resumability/component.tsx`; `packages/insights/src/components/icons/apps.tsx` (all 15 `insights/src/components/icons/*.tsx` are `function XIcon(props, key)` — one fix clears 15) |
| 4 | `RangeError: Maximum call stack size exceeded` | `e2e/qwik-e2e/apps/e2e/src/components/effect-client/effect-client.tsx`; `e2e/qwik-e2e/apps/perf.prod/src/components/store-impl/index.tsx` (also `packages/docs/src/routes/demo/cookbook/drag&drop/{basic,advanced}/index.tsx`) — stack is `pipeline/link/render-results.ts` `evaluate` ↔ `readBinding` (lines 453-459, 531-577, 695) recursing through self/mutually-referential writes such as `items1.value = items1.value.filter(…)` / `state.data = state.data.concat(…)`; no cycle guard on `readBinding` |
| 2 | `UnsupportedError: … a non-QRL component event handler` | `e2e/qwik-e2e/apps/perf.prod/src/components/component-impl/index.tsx`; `packages/docs/src/repl/ui/repl-input-panel.tsx` |
| 2 | `UnsupportedError: … a branch arm capturing "Filter"` | `e2e/qwik-e2e/apps/todo-old-test/src/components/footer/footer.tsx`; `e2e/qwik-e2e/apps/todo-test/src/components/footer/footer.tsx` (same failure as layerA `local-component-captured`, research 03) |
| 2 | `UnsupportedError: … an early return in a collection row` | `packages/docs/src/routes/(ecosystem)/media/index.tsx`; `packages/docs/src/routes/api/index.tsx` |
| 1 | `UnsupportedError: … an async or generator component function` | `e2e/qwik-e2e/apps/e2e/src/components/streaming/streaming-flush.tsx` |
| 1 | `Error: pipeline: imports/hoists without a component` (SSR only) | `e2e/qwik-e2e/apps/preloader-test/src/components/generated/use-theme.tsx` |
| 1 | `UnsupportedError: … a QRL callback capturing "runCount"` | `e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/catchall-loader/[...slug]/index.tsx` |
| 1 | `UnsupportedError: … a generator QRL callback` | `e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/server-func/index.tsx` |
| 1 | `UnsupportedError: … a two-way binding to a non-signal` | `packages/docs/src/components/code-block/code-block.tsx` |
| 1 | `UnsupportedError: … a dynamic slot name` | `packages/docs/src/components/package-manager-tabs/index.tsx` |
| 1 | `UnsupportedError: … a non-event $ attribute on an element` | `packages/docs/src/routes/demo/cookbook/mediaController/index.tsx` |
| 1 | `UnsupportedError: … delay$ without its qrl twin` (`pipeline/generate/emit-setup.ts:286`) | `packages/docs/src/routes/tutorial/composing/dollar/solution/app.tsx` — `delayQrl` + `delay$ = implicit$FirstArg(delayQrl)` are in the same module, called inside an `onClick$` |

12 distinct reasons; the top 2 (`more than one component parameter`, stack overflow) account for
20 of 34. Only the stack overflow is a compiler bug (an uncaught `RangeError` instead of a
diagnostic); the others are declared `UnsupportedError`s.

## 1.3 Accepted with diagnostics (12 files, 7 distinct)

| n | code | message | example files |
| ---: | --- | --- | --- |
| 5 | `children-function` | Pass a render function through a named prop; children are projected content. | `e2e/qwik-e2e/apps/e2e/src/components/streaming/{demo,streaming}.tsx`, `packages/docs/src/routes/demo/integration/modular-forms/index.tsx`, `packages/insights/src/routes/app/[publicApiKey]/edit/index.tsx`, `packages/insights/src/routes/app/add/index.tsx` |
| 2 | `children-read` | Read child info with useChildrenInfo(), or render them with `<Slot />`. | `packages/docs/src/routes/demo/react/{children,counter-two-islands-host}/react.tsx` |
| 3 | `dom-nesting` | dynamic rows outside `<tbody>` / `<li>` in `<div>` / nested `<li>` | `e2e/qwik-e2e/apps/e2e/src/components/render/render.tsx`, `packages/docs/src/routes/demo/cookbook/algolia-search/index.tsx`, `packages/insights/src/routes/app/[publicApiKey]/symbols/bundles/index.tsx` |
| 1 | `raw-text-content` | `<style>` takes a string literal | `e2e/qwik-e2e/apps/e2e/src/components/signals/signals.tsx` |
| 1 | `unsupported-runtime-jsx` | JSX must belong to a supported component or function. | `e2e/qwik-e2e/apps/todo-old-test/src/entry.dev.tsx` |

## 1.4 Silent non-extraction (`$(` surviving in output)

15 files matched; after reading the emitted lines (`probe.txt`) they split into:

**Real pass-throughs (5 files, `component$(` emitted verbatim, zero diagnostics, SSR = CSR):**

| file | what survives | why |
| --- | --- | --- |
| `e2e/qwik-e2e/apps/e2e/src/components/factory/utils.tsx` | 2 × `component$(` | `component$` called inside plain module functions `factory()` / `factoryQrl()` (returned, not assigned to a module binding) |
| `e2e/qwik-e2e/apps/e2e/src/components/slot/slot.tsx` | 6 × `component$(` (`RouteActionResultNavigationIssue3727`, `…ParentA/B`, `…ChildA/B`, `ContentDuplicationDelayedVisibleTaskIssue4283`) | root builds its tree with `jsx(content.value[i], {children})` in a `for` loop (runtime `jsx()` call, cf. research 03 §2); the sibling components referenced from that `useSignal([...])` array are skipped with it |
| `e2e/qwik-e2e/apps/e2e/src/components/suspense/suspense.tsx` | 2 × `component$(` (`OutOfOrderSuspenseContainers`, `OutOfOrderSuspenseContainerFragment`) | components reading `useServerData` + `<Suspense fallback$=…>`; 115 other modules in the file compile |
| `packages/insights/src/components/symbol-tile/index.tsx` | `useResource$(<qrl>)` | callback extracted to a segment but the callee keeps its `$` name (see note) |
| `packages/docs/src/components/theme-toggle/theme-toggle.tsx` | `event$(<qrl>)` | same: `toggleTheme$ = event$(segment.w([store]))` — `eventQrl` exists (`packages/qwik/src/core/index.ts:20`) but is not used |

Note: `useResource$(qrl)` / `event$(qrl)` / `sync$(qrl)` (`modal-panel.tsx`) are "`$` callee kept,
argument already a QRL" — not an extraction miss, but they depend on the runtime `$`-wrapper
accepting a QRL. Worth a snapshot assertion before cutover.

**False positives (10 files):** comments (`docs/routes/demo/component/inline-child`,
`docs/routes/query/**` — the `routeLoader$`/`server$` lines are commented out in source,
`starters/features/builder.io/.../[...index]/index.tsx` — `routeLoader$()` in a comment; the real
`useBuilderContent = routeLoader$(…)` IS extracted), a commented-out component in `slot.tsx`
(`HideUntilVisible`), and runtime calls of `$`-suffixed **values** (`props.hello$(…)`,
`props.onChange$(…)`, `closeOnBackdropClick$(e)`, `closeMobileSidebarOnLink$(…)`,
`context.getContentDimensions$()`), which are correct output. No `routeLoader$(` survives anywhere
outside comments.

## Part 2 — `extractRenderRoots`

### Correction to the ticket premise

`extractRenderRoots` is **not** in `src/extract.ts` and does **not** depend on legacy
`analysis.ts`. It lives in `packages/compiler/src/index.ts:76-293` (interface `ExtractedRenderRoot`
+ function + 6 private helpers, ~215 lines) and its only imports are `parseSync` from `oxc-parser`
plus a self-contained duck-typed AST walker. `src/extract.ts` (1489 lines) is `extractQrls`/the
`QrlExtractor` class — a different thing, already superseded by the pipeline. `index.ts` also
imports `analyzeModule`, but only for `registerNativeFns` (line 296) and `transformInput`.

### What a render root is

A **render root** is the identifier passed as first argument to a test's `render(...)` /
`csrRender(...)` / `ssrRender(...)` / `<anything>.render(...)` call inside a `*.spec|test|unit.*`
file (`isRenderCall`, index.ts:166-179). The harness (`packages/qwik-vite/src/plugins/test-resume.ts:84-104`,
called from `vite.ts:597` for every module when `testTarget` is set) rewrites each root to an import
`import { <name> as __qwik_test_root_i } from "<spec>.qwik-test-root-<sourceIndex>.tsx"`, replaces
the argument text `[argumentStart, argumentEnd)` with the alias, and registers `root.code` as a
synthetic source module (`testSources`) that the plugin then compiles with `transformPipelineModules`
on both server and client (`transform()`, lines 116-131). So test-local components get real SSR
and CSR output and the resume harness can serve the client side.

### Algorithm (index.ts:86-158)

1. `parseSync` (oxc, `astType: 'ts'`, `range: true`); on parse errors return `[]`.
2. Collect the source text of every top-level `ImportDeclaration`.
3. Walk the whole program (`visitTestSource`: generic walk over every object-valued key except
   `type/start/end/range/loc`), tracking ancestors.
4. For each `isRenderCall` whose first argument is an `Identifier`:
   a. `collectScopedDeclarations(ancestors, call.start, code)` — for every ancestor `Program` /
      `BlockStatement`, take statements that **end before the call**: `VariableDeclaration`
      (identifier ids only) → `export <kind> <text>;`, `FunctionDeclaration`/`ClassDeclaration`
      → `export <text>`; inner scopes shadow outer by name (Map insertion order).
   b. If the root name is not declared there → skip.
   c. `collectReachableDeclarations` — BFS from the root name over `Identifier`/`JSXIdentifier`
      names found by walking each declaration node; keeps only reachable declarations, in
      declaration order.
   d. Remember the root's own `scope` node (the block that declared it).
5. Group roots by that scope node → one synthetic source per scope (`sourceIndex`), declarations
   merged by `node.start`.
6. Emit per root: `{argumentStart, argumentEnd, exportName, sourceIndex, code: imports + '\n' +
   exported declarations + '\n'}`.

Limits worth carrying over knowingly: no real scoping (name-based reachability; a same-named
inner binding shadows by Map order only), only identifier arguments (`render(<App/>)` or
`render(component$(...))` inline is not a root), all imports are copied even if unused, and
default-exported roots are not handled (not needed — spec files don't export them).

### Legacy facts used → pipeline counterparts

| legacy fact / import | where | pipeline counterpart |
| --- | --- | --- |
| `parseSync` from `oxc-parser` (lang from `path.endsWith('x')`) | index.ts:87-92 | `parseModule(path, code)` in `pipeline/analyse/ast/parse.ts:9-20` — identical options, better `getLang` |
| duck-typed `SourceNode` walk (`visitTestSource`, `isSourceNode`, `SOURCE_NODE_KEYS`) | index.ts:160-176, 280-293 | none as a generic ancestor walk; `createBindingGraph` (`ast/bindings.ts:77`) records `parentOf(node)` and `calls` (every `CallExpression`), which replace both the walk and the ancestor list |
| `isRenderCall` (callee name set `render/csrRender/ssrRender/*.render`) | index.ts:166-179 | none — test-harness knowledge; stays in the port (it is the one domain rule) |
| `collectScopedDeclarations` (statements-before-call, per Program/Block) | index.ts:181-224 | `BindingGraph.declaration(node)` / `declarationsOf(id)` / `declaredWithin(roots)` (bindings.ts:34-58) give the real scoping; `forEachModuleDeclaration` (`ast/returns-jsx.ts:101`) for the top level |
| `collectReachableDeclarations` (name-based BFS) | index.ts:226-252 | `BindingGraph.freeReferences(roots)` + `dependenciesOf(expr, candidates)` (bindings.ts:52-55) — binding-based, shadow-correct |
| `code.slice(start,end)` + `export ` prefix text assembly | index.ts:200-218, 150-157 | none needed; same string assembly |
| `analysis.ts` (`analyzeModule`, `containsJsx`, `findBindingByDeclaration`) | **not used** | — |
| `words.ts` / `plan-types.ts` / `jsx-ast-utils.ts` | **not used** | — |
| `JsxAnalysis` (`ast/jsx-analysis.ts`), `discoverComponents` (`discover.ts:36`), `findComponentCandidates` (`returns-jsx.ts:30`), `scanModuleSurface` (`module-surface.ts:23`) | — | **not required**: roots are chosen by the `render(...)` call, not by being components; the synthetic module goes through the full `analyseModule` afterwards anyway |

### Port size and where it goes

- **~150-200 lines** of new pipeline code (e.g. `pipeline/compat/extract-render-roots.ts` or
  `pipeline/analyse/render-roots.ts`): `parseModule` + `createBindingGraph`, then `bindings.calls`
  filtered by `isRenderCall` (~15 lines), root binding via `bindings.reference(arg)`, reachability
  via `freeReferences`/`dependenciesOf` over the declaring statements (~30 lines), scope grouping by
  the declaring block (`parentOf` chain, ~20 lines), text assembly (~25 lines). A straight move of
  the existing 215 lines with `parseSync` → `parseModule` is the floor (~0 new logic); using
  `BindingGraph` is the ceiling and fixes the name-based shadowing hole.
- Re-export from `packages/compiler/src/index.ts` must remain until `qwik-vite` switches its import
  (`test-resume.ts:1-4` imports `extractRenderRoots` and `transformPipelineModules` from
  `@qwik.dev/compiler`); the `ExtractedRenderRoot` shape (`argumentStart/argumentEnd/code/
  exportName/sourceIndex`) is the contract to keep.

### Tests that pin it

- `packages/compiler/src/analysis.unit.ts:175-244` — 4 cases: nested roots with reachable
  declarations + `unrelated` excluded; imports kept; `harness.render(App)` member-call form; two
  roots in one scope share one `sourceIndex`/`code` with one `export const shared`. These move
  with the function (the rest of that file tests legacy `analyzeModule` and dies with it).
- `packages/qwik-vite/src/plugins/test-resume.unit.ts` — does **not** call
  `prepareTestSource`/`extractRenderRoots` (tests: 18 `does not alias ordinary modules…`, 37
  `uses pipeline output for both sides of the … harness` ×3, 75 `resolves generated chunks from a
  CSR test root`, 115 `keeps SSR node resolution…`, 216 `enables the compiler harness…`). It pins
  `transform()`/`resolveId()` only.
- End-to-end: the root `vitest.config.ts` `csr`/`resume`/`ssr` projects run every
  `packages/qwik/src/core/tests/*.spec.tsx` through `vite.ts:597` → `prepareTestSource`, so any
  regression in root extraction fails those suites (resume is the one that proves the client side).
