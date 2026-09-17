# LayerA fixture salvage: which inputs cover constructs the pipeline snapshots lack

Ticket: `.scratch/compiler-pipeline-cutover/issues/03-layera-fixture-salvage.md`
Date: 2026-09-17

## Method

- Inputs: the 58 dirs under `packages/compiler/conformance/layerA/fixtures/*/input.tsx` (plus sibling
  `*.tsx` modules in `dynamic-tag-component`, `implicit-dollar-call`, `imported-callback`,
  `multi-module`, `plugin-call`, `plugin-callback`), passed the way
  `conformance/layerA/harness.ts:102-121` builds them (`src/<file>`).
- Coverage oracle: `packages/compiler/pipeline/tests/snapshots.unit.ts` (3347 lines, 175 `testInput(s)`
  calls + `test.each` families = 217 snapshot names, 434 `pipeline/tests/snapshots/*.snap`).
  Line numbers below cite that file.
- Accept/reject: ran `transformModules` from `packages/compiler/pipeline/compat/transform-modules.ts`
  on every fixture in SSR (`isServer: true`) and CSR (`isServer: false`) with the option shape of
  `snapshots.unit.ts:22-33` (`srcDir: 'src', transpileTs, transpileJsx, sourceMaps: false`).
  Script: scratchpad `layera-salvage.unit.ts`, run as a throwaway
  `packages/compiler/pipeline/tests/zz-layera-salvage-tmp.unit.ts` via `npx vitest run <file>` from
  the repo root (the root vitest project's include is `**/*.unit.*` under `packages/`, so a scratchpad
  path is not collected); the temp file was deleted afterwards (`git status` clean).
  Raw results: scratchpad `results.json`, emitted code in `results-code.json`.
- SSR and CSR results are identical for every fixture (same accept/reject and same diagnostics).

## 1. Fixture → constructs → covering pipeline snapshot fixture

"none" means no snapshot fixture exercises the construct (other `pipeline/tests/*.unit.ts` may still touch it; noted where found).

| layerA fixture | constructs exercised | covering pipeline snapshot fixture (`snapshots.unit.ts` line) |
| --- | --- | --- |
| branch-collection | `useComputed$` + `useTask$` writing a signal in setup; ternary whose arm is a keyed `.map` collection with `index` param and a method-call text hole; computed read in text hole | setup-computed (791), setup-task-hook (735), collection-key-nested-conditional (2785), collection-index-signal (1356); **no fixture combines a ternary with a collection arm inside a titled parent plus computed footer, but each piece is covered** |
| child-props | function component with `props.x` reads; parent passes static string + `count.value` | component-props (1867), text-hole-siblings-props (1106) |
| class-object | `class={{ a: signal, b: false, c: true }}` object literal | attribute-class-style (2016) |
| component-event-prop | `onClick$` prop forwarded through a component; `stoppropagation:click`; `<Slot />` | component-event-prop (2380), event-scopes-modifiers (1753) |
| component-signal-identity | passing a `Signal` object (not `.value`) as a prop; child `useTask$` writes it; parent attr reads it | component-binding-prop (1891) passes a signal object; **none** for a child that writes a passed signal from `useTask$` |
| component-spread-mixed | `{...obj}` before and after a static prop on a component | component-props-spread (2306) |
| component-spread-props | `{...obj}` alone on a component | component-props-spread (2306) |
| component-spread-signal | `{...obj}` plus a `signal.value` prop | component-props-reactive-spread-mixed (2328) |
| computed-task | `useComputed$` + `useTask$` conditional signal write; computed in text hole, signal in attr | setup-computed (791), setup-task-hook (735), dynamic-attr-signal (1134) |
| cond-attr | ternary attr on a signal; ternary text hole with nested signal read; toggling event | dynamic-attr-signal (1134), branch-ternary-signal (1145), capturing-event (1057) |
| context | `createContextId` + `useContextProvider(signal)` + `useContext` in a sibling module-level component | setup-context (488) |
| deferred-collection | non-exported arrow component (`const Badge = ({label}) => {...}`) with block body; keyed collection with `class={{ on: signal === item }}` on the row root | component-local-declaration (471), collection-row-dynamic-class (1431) |
| def-helper | module-level plain (non-JSX) helper function + arrow calling it from a text hole with a signal arg | qrl-module-bindings (247), local-functions (2981) cover module/local helpers; **none** for a template-literal helper chain, but same mechanism |
| derived-collection | `.filter(cb).map(cb)` on a signal array, keyed rows | collection-source-filtered (2702), collection-keyless-derived (1232) |
| dynamic-slot-name | `<Slot name={props.pick} />` + parent `q:slot` children switched by a signal | projection-dynamic-name (3025), component-children-dynamic-slot (3205) |
| dynamic-tag | local component in setup; `const Tag = props.tag ?? 'h1'` and `const Rule = 'hr'` as tags (element-or-component decided at runtime) | component-dynamic-tags (3117): plain-value and props tags; **none** for a `??`-defaulted tag alias or a local (setup-scoped) component holding the dynamic tag |
| dynamic-tag-component | `const Tag = Badge` (imported component alias) as a tag; sibling module | component-dynamic-tags (3117) `Alias = Badge`, component-call-import (3289) |
| e2-undef-text | `const missing = undefined` rendered in a text hole (must print nothing) | **none** in snapshots (the setup-local `undefined` in a text position is not exercised; `dynamic-child-nullish` (2801) covers `??` only) |
| e6-index-read | `words.value[at.value]` (reactive index) and `words.value[0]` in text holes | local-component-tag (3088) uses a literal index for a *tag*; **none** for index reads in text holes, none for a reactive index |
| e7-unary | `!signal`, unary `-signal`, `typeof signal` in attr/text holes | **none** (no `typeof`/unary-minus in any snapshot; `!` appears only inside handlers) |
| fragment-root | `component$` child returning `<>text {props.x}</>` (fragment root with a props hole) | component-return-fragment (438) covers a fragment return; **none** for a fragment root with a reactive props hole |
| fragment-tag | `<Fragment key={i}>` rows over `Array.from({length: signal})` | jsx-fragment (65) imports `Fragment` with keys; collection-fragment-row (1367) |
| global-call-setup | `String(x)` / `parseInt()` global calls in setup on a signal read | ordinary-component-body (216) and element-literal-spread (1907) call `String(...)`; **none** for `parseInt`, same mechanism |
| if-setup | `let` + `if/else` reassignment in setup before render | component-binding-prop (1891) `let label` reassigned; **none** for an `if/else` block in setup (`if` only via early return/try in ordinary-component-body 216) |
| implicit-dollar-call | imported custom `transform$` call as a component prop value (implicit `$` marker → `transformQrl`) | marker-qrl-anywhere (1681), explicit-qrl-anywhere (1462) |
| imported-callback | `.filter(FILTERS.active)` with an imported member as the callback, in setup | **none** (filters in snapshots are inline arrows; collection-callback-shapes 2903 covers referenced callbacks only in `.map` rows) |
| inner-html | static `dangerouslySetInnerHTML` string on an element | element-inner-html (1963) |
| jsx-call | `jsx('p', {...})` runtime-call arms inside a JSX ternary | **none** — see section 2 (passes through untouched) |
| jsx-call-as-value | `const badge = jsx('span', ...)` stored then rendered | **none** — pass-through |
| jsx-call-dev-runtime | `jsxDEV(...)` as the whole component return | **none** — pass-through, `App` not even marked |
| jsx-call-identifier-tag | `jsx(Badge, {...})` component tag as return | **none** — pass-through |
| jsx-call-key-arg | `jsx('div', {...}, 'k1')` key argument | **none** — pass-through |
| jsx-call-literal-tag | `jsx('div', {class, children})` as return | **none** — pass-through |
| jsx-call-nested-in-jsx | `{jsx(Badge, ...)}` as a JSX child | **none** — pass-through |
| jsx-syntax-as-value | `const badge = <span/>` stored then rendered | jsx-value (203), jsx-assignment (43) |
| local-component | local component in setup, nested local component inside it, both closing over a `useStore`; used as a keyed collection row AND a direct call; event writes the store | ordinary-component-body (216) has a local `Child` in setup; **none** for a local component used as a collection row, a nested-in-local component, or a store-mutating event inside a local component |
| local-component-captured | local component closing over a store, rendered inside a signal ternary arm | **rejected** (section 2); **none** |
| local-component-context | local components calling `useContextProvider` / `useContext` | setup-context (488) at module level; **none** for hooks inside setup-scoped components |
| local-component-props | local component reading its own props plus an outer signal | ordinary-component-body (216) (local `Child` reads outer `props`); **none** for outer-signal capture in a local component |
| local-component-signal-props | local component fed `n={count.value}` | component-props (1867) for module-level; **none** for setup-scoped |
| local-component-slots | local component with `<Slot />`; parent projects a signal hole | component-children-signal (2524) for module-level; **none** for setup-scoped |
| mixed-text | text hole mixed with static text and `{count.value + 7}` arithmetic in one `<p>` | text-hole-multi-siblings-signal (1846), text-only-content (2947), expression-hole-signal (1804) |
| multi-module | component imported from a sibling input module with its own signal + event | component-call-import (3289), qrl-imports (263) |
| plugin-call | `native$(fn, { rust: nativeFrom('./x.rs') })` in a sibling module, called in `useSignal(...)` | **none** — `native$` has no pipeline handling (`grep native\$ pipeline/` empty); the sibling module passes through untouched |
| plugin-callback | ordinary imported `compute(() => ...)` callback in setup reading a signal, result in a text hole | jsx-callback (125) (`consume(...)` ordinary callbacks), setup-custom-hook (575) |
| projected-slot | `<Slot />` forwarded through two nested local components | component-slot-forwarding (3256) at module level; **none** for setup-scoped |
| signal-counter | `onClick$={() => count.value++}` + text hole | counter (1068) |
| slot-fallback | `<Slot>fallback</Slot>` with and without projection | component-slot-fallback (3238) |
| slot-projection | `<Slot />` + static prop + projected signal hole with sibling text | component-children-slot (2515), component-children-signal (2524) |
| static-attrs | boolean-valued static attrs (`aria-hidden={false}`, `draggable={true}`, `spellcheck`, `readOnly`, `contentEditable`, `hidden={false}`, `data-step={3}`) | attribute-parity (1989), static-attributes (880) |
| static-page | no state, static tree | static-default-arrow (843), nested-tree-void-raw-text (889) |
| store-bind | `bind:value={signal}` + `useStore` member text hole | element-bind (2104), setup-store (516), dynamic-child-store-member (2807) |
| suspense-inline | `<Suspense fallback$={...}>` around an `async function` component | **rejected** (section 2); **none** (`Suspense` appears in no pipeline test) |
| suspense-stream | same input, `request.json` `"stream": true` | **rejected**; **none** |
| template-text | `` {`Hello ${name.value}!`} `` template literal text hole | text-hole-concat (1221) covers `'a' + x`; **none** for a template literal |
| use-styles | `useStyles$` with a signal text hole | setup-styles (644) |
| visible-task | `useVisibleTask$` writing a signal read in the tree | setup-visible-task (589) |
| visible-task-static | `useVisibleTask$` with a static tree (nothing reads the signal) | setup-visible-task (589) partially; **none** for a static tree |

## 2. Inputs the pipeline rejects (or silently passes through)

Hard rejects (`UnsupportedError`, thrown, identical in SSR and CSR):

| fixture | error | origin |
| --- | --- | --- |
| local-component-captured | `pipeline does not support: a branch arm capturing "Filter"` | `packages/compiler/pipeline/analyse/ast/capture-analysis.ts:185` (a local component referenced from a branch arm); same failure noted for the router outlet in `pipeline/JSX-IMPLEMENTATION.md:889` |
| suspense-inline | `pipeline does not support: an async or generator component function` | `packages/compiler/pipeline/analyse/discover.ts:87` (the `export async function Delayed` component) |
| suspense-stream | same as above | same |

Silent pass-throughs (no diagnostics, but the construct is not compiled — emitted code in `results-code.json`):

| fixture | what happens |
| --- | --- |
| jsx-call-literal-tag, jsx-call-key-arg, jsx-call-dev-runtime, jsx-call-identifier-tag | `App` is emitted verbatim (`return jsx("div", {...})`), not `_markComponent`ed, no SSR/CSR lowering; the runtime `jsx` export only throws (per the fixture comment in `jsx-call/input.tsx`) |
| jsx-call, jsx-call-as-value, jsx-call-nested-in-jsx | `App` is lowered, but the `jsx(...)` calls survive as opaque values fed to `renderSsrDynamicContent`/content blocks |
| plugin-call | `greeting.tsx` passes through with `native$(...)`/`nativeFrom(...)` intact; no pipeline code references `native$` |

All other 52 fixtures are accepted with zero diagnostics in both modes.

## 3. Recommended salvage list

Port (as `snapshots.unit.ts` cases) the inputs whose construct no snapshot exercises and which the pipeline already accepts — they turn free coverage into golden files:

1. `e7-unary/input.tsx` — `!`, unary `-`, `typeof` on signal reads.
2. `e6-index-read/input.tsx` — reactive and literal index reads in text holes.
3. `e2-undef-text/input.tsx` — `undefined` setup local in a text hole.
4. `template-text/input.tsx` — template-literal text hole (sibling of text-hole-concat).
5. `if-setup/input.tsx` — `let` + `if/else` block in setup.
6. `imported-callback/input.tsx` + `filters.tsx` — imported member reference as a `.filter` callback in setup (two-module `testInputs`).
7. `local-component/input.tsx` — local component as a keyed collection row, nested local component, store-mutating event; best single case for setup-scoped components.
8. `local-component-context/input.tsx` — hooks (`useContextProvider`/`useContext`) inside setup-scoped components.
9. `local-component-slots/input.tsx` and `projected-slot/input.tsx` — `Slot` and slot forwarding through setup-scoped components.
10. `component-signal-identity/input.tsx` — child `useTask$` writing a signal passed by identity.
11. `fragment-root/input.tsx` — `component$` fragment root carrying a reactive props hole.
12. `dynamic-tag/input.tsx` — `??`-defaulted dynamic tag alias inside a local component.
13. `visible-task-static/input.tsx` — visible task with a tree that never reads its signal.

Keep as TODO/regression inputs (currently rejected or pass-through; port once the feature lands):

- `local-component-captured` (branch arm capturing a local component) — pairs with the router-outlet failure.
- `suspense-inline` / `suspense-stream` (async component + `Suspense`) — `stream: true` is a render-request option, not a compiler input; one snapshot input suffices.
- `jsx-call-*` (7 fixtures) — collapse into one or two inputs (`jsx-call` for in-JSX arms, `jsx-call-identifier-tag` for the bare-return case) once `jsx()`/`jsxDEV()` calls are lowered.
- `plugin-call` (`native$`/`nativeFrom`) — only if the pipeline is meant to own native plugins.

Not worth porting (already covered one-to-one, see table 1): branch-collection, child-props, class-object, component-event-prop, component-spread-*, computed-task, cond-attr, context, deferred-collection, def-helper, derived-collection, dynamic-slot-name, dynamic-tag-component, fragment-tag, global-call-setup, implicit-dollar-call, inner-html, jsx-syntax-as-value, local-component-props, local-component-signal-props, mixed-text, multi-module, plugin-callback, signal-counter, slot-fallback, slot-projection, static-attrs, static-page, store-bind, use-styles, visible-task.
