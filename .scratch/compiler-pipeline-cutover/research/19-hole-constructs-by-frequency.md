# 19 — Server-reachable hole constructs by frequency

Ticket: `../issues/19-hole-constructs-by-frequency.md`. Repo root `/home/michal/Dokumenty/git/qwik`,
branch `v3`, working tree of 2026-09-17 (HEAD `7ad8d8b03`). Paths below are relative to
`packages/compiler/pipeline/` unless absolute. Builds on research 06 (producer sites) and 16
(acceptance sweep / rejected files).

## Method

- Driver: a temporary vitest file (`tests/zz-holes-tmp.unit.ts`, run with
  `npx vitest run --root . <path>` from the repo root, deleted afterwards) calling `analyseModule`
  (`analyse/analyse-module.ts:57`) with `{ transpileTs: true }` per input, exactly as
  `compat/transform-modules.ts:33-36` does. Raw per-hole rows are in the scratchpad
  (`holes.json`, `holes-stats.json`, `holes-failures.txt`; aggregation `agg.mjs`, `tables.mjs`).
- Corpus A ("fixtures"): the `==INPUT==` block of all 217 `tests/snapshots/*.ssr.snap` (4 are
  multi-module and split on their `// src/…` separators): **208 `ModuleKind.Qwik` plans**; 11 are
  `failed` by design and 1 is `foreign`.
- Corpus B ("real"): every `.tsx` under `e2e/qwik-e2e/apps` and `packages/docs/src` (skipping
  `node_modules/dist/lib/server/build`): 753 files, minus the 19 that research 16 §1.2 lists as
  rejected → 734 analysed, **676 Qwik plans** (58 are `foreign`, i.e. no component, or `failed`
  with the diagnostics research 16 §1.3 lists).
- Hole collection: walk each `qrls[].body` (+ `functions`), each `hooks[].body`, and each
  `assembly[]` `AssemblyKind.Payload` root generically; a hole is any `{kind:'js', payload}`
  (`ExprKind.Js`), `{s:'js', payload}` (`SetupKind.Js`), `{b:'js', payload}` (`QrlBodyKind.Js`)
  or a module-level `AssemblyKind.Payload` id ("helper"). Program references (`program`,
  `content`, `fallback` ids) and payload hole tables (`renders`, `setups`, `temps.init`) are
  followed; `QrlUse` edges are not (the referenced QRL is its own root). Holes are **deduplicated
  by (kind, payload id) per module** — a Computed value's `expr` and its resume QRL's
  `QrlBodyKind.Expr` share one payload and count once. Patterns, `propsParts`, dynamic css and
  orphaned payloads (research 06 §1) are not counted. This is why the fixture `ExprKind.Js` total
  here (373) is lower than research 06's 480, which counted every occurrence.
- Server reachability, decided per owning QRL root: excluded when `boundary` is `Sync`,
  `Implicit/event` (every `on*$`, `document:`/`window:` element handler), `Implicit/hook` with
  `ctxName === 'useVisibleTask$'`, or `Implicit/expression` whose ctxName is an event attribute
  (`onClick$={alias}`); a QRL with no excluded boundary of its own is still excluded when *every*
  QRL/hook/helper that references it (`QrlUse` edges found by the walk — `Qrl.parent` is always
  `null`, `analyse/lower-context.ts:137`) is excluded (nested `$()` inside a handler). Everything
  else — component render programs, rows/keys/arms/projections, `$()`, `useTask$`/`useComputed$`/
  `useSerializer$`/custom `use*$`/`routeLoader$`/`server$` callbacks, lifted local functions,
  hook bodies, module helpers — is included.
- Classification: `oxc-parser` `parseSync` on the payload's slice of `plan.source.code`
  (normalised code, `analyse-module.ts:169`). Expressions are wrapped in `(…)`; setup statements
  are wrapped in `async function(){…}`; helpers parse as a module statement. The root node is
  classified after stripping parentheses and TS `as`/`!`/`satisfies`. A `QrlBodyKind.Js` hole is
  classified by its **function body**: an expression body is one row (`qrl-expr-body …`), a block
  body contributes one row per top-level statement (`qrl-block-stmt …`), so construct rows exceed
  hole counts. Identifier / member-chain roots are tagged with the root binding's `BindingScope`
  (`local` = declared in a component/hook/row body, `loop` = row parameter, `param`, `module`,
  `import`); member calls carry the receiver class and the method name. `await` = the slice
  matches `/\bawait\b/` (cross-checks with `payload.awaits`). Zero parse errors in either corpus.

Abbreviations in the example column: `e2e/…` = `e2e/qwik-e2e/apps/e2e/…`, other app names are
`e2e/qwik-e2e/apps/<name>/…`, `docs/…` = `packages/docs/src/…`, fixture names are
`tests/snapshots/<name>.ssr.snap`.

## Totals

| corpus | modules | `ExprKind.Js` in / out | `QrlBodyKind.Js` in / out | `SetupKind.Js` in | helper `AssemblyKind.Payload` in | holes in | with `await` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fixtures | 208 | 370 / 3 | 50 / 77 | 27 | 9 | **456** | 6 (1.3 %) |
| real | 676 | 2097 / 6 | 398 / 466 | 157 | 163 | **2815** | 81 (2.9 %) |

Excluded owners (real): `implicit:event` 590 rows, `useVisibleTask$` 134, `sync$` 6, nested
`$()` under handlers 2, event-aliased expressions 8. The cross-check against research 06 holds:
50 + 77 = 127 `QrlBodyKind.Js`, 27 `SetupKind.Js`.

## Table 1 — fixtures (server-reachable), ranked by construct
Summary: 456 holes (expr=370, qrl=50, setup=27, helper=9) → 472 construct rows; 6 holes contain `await` (qrl=5, setup=1)

| # | construct | n | examples |
|---:|---|---:|---|
| 1 | array-literal | 62 | `["base", { active: active.value, disabled: !active.value }]` — attribute-class-style<br>`[]` — collection-alias-calls |
| 2 | identifier (local) | 52 | `visible` — collection-key-conditional-derived<br>`visible` — collection-key-conditional-reactive |
| 3 | member (x.value chain, root local) | 38 | `show.value` — branch-arm-signal-text<br>`show.value` — branch-else-null |
| 4 | identifier (loop) | 36 | `id` — collection-alias-calls<br>`index` — collection-array-index |
| 5 | binary (+) | 33 | `label + "!" + id` — collection-destructured-opaque<br>`prefix + item` — collection-inline-module-const |
| 6 | member (plain chain, root loop) | 25 | `item.label` — collection-fragment-row<br>`item.id` — collection-index-signal |
| 7 | object-literal | 23 | `{ opacity: active.value ? 1 : .5 }` — attribute-class-style<br>`{ title: "save" }` — component-props-reactive-spread-event |
| 8 | identifier (param) | 17 | `item` — collection-keyless-derived<br>`rest` — component-prop-rest |
| 9 | member (plain chain, root local) | 14 | `children.length` — children-descriptor-fragment<br>`children.length` — children-descriptor |
| 10 | call:identifier(import) | 14 | `createTitle()` — component-prop-defaults<br>`$(() => console.log("click"))` — custom-hook-bodies |
| 11 | logical (&&) | 8 | `done && selected.value` — collection-key-conditional-derived<br>`done && selected.value` — collection-key-conditional-reactive |
| 12 | identifier (module) | 8 | `fallback` — component-prop-default-scope<br>`Fallback` — component-qrl-props |
| 13 | qrl-block-stmt stmt:var const | 7 | `const create = async (_await) => { await load(_await); const label = count.value` — jsx-async<br>`const text = label;` — jsx-factory-prop |
| 14 | function-expression | 5 | `(row) => <li key={row}>{row}</li>` — collection-callback-shapes<br>`() => <b>fn</b>` — dynamic-child-function |
| 15 | helper stmt:function-decl | 5 | `function renderDeclared(row) { return <li key={row}>{row}</li>; }` — collection-callback-shapes<br>`function later(run) { return $(() => run()); }` — explicit-qrl-anywhere |
| 16 | stmt:expr call:identifier(import) | 5 | `register((value) => Promise.resolve(<b>{value}</b>));` — jsx-async<br>`consume(<span>{label}</span>);` — jsx-call |
| 17 | qrl-block-stmt stmt:expr await | 5 | `await Promise.resolve(value);` — qrl-await<br>`await Promise.resolve();` — setup-computed-async |
| 18 | qrl-expr-body member (x.value chain, root local) | 5 | `count.value` — setup-custom-hook<br>`count.value` — setup-hook-qrl |
| 19 | binary (>) | 4 | `count.value > 2` — branch-arm-expression<br>`label.length > 0` — component-children-mapped-const-array |
| 20 | stmt:if | 4 | `if (row > 1) { label += "!"; }` — collection-row-statements<br>`if (!flag) { return null; }` — custom-hook-bodies |
| 21 | stmt:expr assign:local (=) | 4 | `label = wrap(label);` — collection-row-statements<br>`label = "b";` — component-binding-prop |
| 22 | qrl-expr-body jsx | 4 | `<b>{v + count.value}</b>` — component-qrl-props<br>`<b>{value}</b>` — jsx-callback |
| 23 | qrl-expr-body call:global console.log | 4 | `console.log("click")` — custom-hook-bodies<br>`console.log(count.value)` — event-handler-arrays |
| 24 | qrl-expr-body literal | 4 | `1` — custom-hook-bodies<br>`42` — setup-computed-options |
| 25 | qrl-block-stmt stmt:expr update:x.value (++) | 4 | `count.value++;` — explicit-qrl-anywhere<br>`count.value++;` — mutable-qrl-event |
| 26 | qrl-expr-body call:identifier(import) | 4 | `consume(<span>task</span>)` — jsx-callback<br>`log(v + step)` — nested-qrl-captures |
| 27 | jsx | 4 | `<F><em>stored</em><F /></F>` — jsx-fragment<br>`<b>ready</b>` — jsx-prop |
| 28 | stmt:expr assign:local (+=) | 3 | `label += "!";` — collection-row-statements<br>`suffix += "!";` — ordinary-component-body |
| 29 | stmt:function-decl | 3 | `function wrap(value) { return "[" + value + "]"; }` — collection-row-statements<br>`function local(label) { return <span>{label}</span>; }` — jsx-helper |
| 30 | call:identifier(local) | 3 | `label("x")` — local-functions<br>`suffix("y")` — local-functions |
| 31 | helper stmt:expr call:identifier(import) | 3 | `$("hello")` — qrl-value-arguments<br>`sync$((event) => event.preventDefault())` — sync-handlers |
| 32 | qrl-expr-body binary (*) | 3 | `count.value * 2` — setup-computed-chain<br>`count.value * 2` — setup-computed |
| 33 | conditional | 2 | `item.done ? "done" : "todo"` — collection-row-dynamic-class<br>`flip ? "y" : "n"` — setup-live-aliases |
| 34 | call:identifier(unresolved/global) | 2 | `String(row)` — collection-row-statements<br>`String(clicks.value)` — element-literal-spread |
| 35 | binary (*) | 2 | `n * 2` — collection-row-statements<br>`count.value * 2` — component-computed-prop |
| 36 | member (plain chain, root param) | 2 | `item.id` — collection-source-filtered<br>`props.title` — ordinary-component-body |
| 37 | identifier (import) | 2 | `Badge` — component-dynamic-tags<br>`config` — qrl-value-arguments |
| 38 | qrl-expr-body member (plain chain, root param) | 2 | `v.x` — component-qrl-props<br>`props.title` — setup-custom-hook |
| 39 | logical (\|\|) | 2 | `props.label \|\| <b>none</b>` — dynamic-child-logical-or<br>`props.label \|\| (count.value, <b>x</b>)` — dynamic-child-sequence |
| 40 | qrl-block-stmt stmt:return (call:identifier(local)) | 2 | `return create("ready");` — jsx-async<br>`return report();` — nested-qrl-captures |

Tail (37 more constructs, 43 rows): helper stmt:expr function-expression=2, qrl-block-stmt stmt:return (binary (+))=2, qrl-expr-body binary (+)=2, stmt:expr assign:x.value (=)=2, stmt:expr call:identifier(unresolved/global)=2, qrl-block-stmt stmt:expr call:global console.log=2, call:identifier(loop)=1, call:global JSON.stringify=1, call:member on member chain .filter=1, member (x.value chain, root loop)=1, call:member on signal.value chain .filter=1, call:member on local identifier .toUpperCase=1, call:identifier(module)=1, qrl-block-stmt stmt:expr member (x.value chain, root local)=1, stmt:return (object-literal)=1, stmt:return (identifier (param))=1, logical (??)=1, call:global Promise.resolve=1, qrl-expr-body call:identifier(param)=1, qrl-expr-body assign:x.value (+=)=1, call:member on literal(array) .map=1, optional-chain (MemberExpression)=1, qrl-block-stmt stmt:return (jsx)=1, member (plain chain, root unresolved)=1, qrl-block-stmt stmt:return (identifier (param))=1, qrl-expr-body member (x.value chain, root param)=1, stmt:return (identifier (local))=1, stmt:try=1, qrl-block-stmt stmt:return (member (x.value chain, root local))=1, qrl-expr-body call:identifier(module)=1, qrl-block-stmt stmt:return (binary (*))=1, qrl-block-stmt stmt:expr call:member on param identifier .onSave$=1, qrl-expr-body object-literal=1, call:member on signal.value chain .getFullYear=1, qrl-block-stmt stmt:expr call:identifier(param)=1, qrl-block-stmt stmt:expr assign:x.value (=)=1, qrl-expr-body update:x.value (++)=1

Coarse buckets: identifier=115, member=90, array-literal=62, binary=44, call:identifier(import)=26, object-literal=24, logical=11, stmt:return=11, stmt:function-decl=8, jsx=8, function-expression=7, assign:local=7, stmt:var const=7, call:member=6, call:global console.log=6, update:x.value=5, await=5, call:identifier(unresolved/global)=4, stmt:if=4, literal=4, assign:x.value=4, call:identifier(local)=3, conditional=2, call:identifier(module)=2, call:identifier(param)=2, call:identifier(loop)=1, call:global JSON.stringify=1, call:global Promise.resolve=1, optional-chain=1, stmt:try=1

Owners: component=135, implicit:for=102, implicit:expression=53, implicit:branch=41, implicit:hook=37, implicit:projection=24, implicit:jsx-value=19, explicit=19, implicit:content=15, helper=10, implicit:function=4, hook:useCounter=3, hook:useMaybeClick=3, implicit:jsx-factory=3, implicit:prop=1, hook:useClick=1, hook:useLocalQrl=1, hook:useLocal=1

Member-call method names: log=6, filter=2, stringify=1, toUpperCase=1, resolve=1, map=1, onSave$=1, getFullYear=1

Await holes by owner: implicit:hook/useTask$=2, implicit:hook/useComputed$=2, explicit/$=1, component/default=1

## Table 2 — real apps (e2e + docs), ranked by construct
Summary: 2815 holes (expr=2097, qrl=398, helper=163, setup=157) → 3149 construct rows; 81 holes contain `await` (qrl=58, helper=23)

| # | construct | n | examples |
|---:|---|---:|---|
| 1 | object-literal | 277 | `{ name: "World", count: 0 }` — e2e/src/components/async/async.tsx<br>`{ count: 0 }` — e2e/src/components/attributes/attributes.tsx |
| 2 | identifier (local) | 271 | `rerenders` — e2e/src/components/attributes/attributes.tsx<br>`state1` — e2e/src/components/context/context.tsx |
| 3 | member (plain chain, root local) | 260 | `state.count` — e2e/src/components/async/async.tsx<br>`state.label` — e2e/src/components/attributes/attributes.tsx |
| 4 | member (x.value chain, root local) | 170 | `hide.value` — e2e/src/components/attributes/attributes.tsx<br>`attributes.value` — e2e/src/components/computed/computed.tsx |
| 5 | helper stmt:expr call:identifier(import) | 148 | `factory$(() => { return <div>A</div>; })` — e2e/src/components/factory/factory.tsx<br>`worker$(() => { return "hello from worker"; })` — e2e/src/components/worker/worker.tsx |
| 6 | identifier (module) | 136 | `Ctx` — e2e/src/components/backpatching/backpatching.tsx<br>`Context1` — e2e/src/components/context/context.tsx |
| 7 | qrl-block-stmt stmt:var const | 123 | `const countValue = count.value;` — e2e/src/components/build-variables/build.tsx<br>`const remoteUrl = props.url;` — e2e/src/components/containers/container.tsx |
| 8 | qrl-block-stmt stmt:if | 91 | `if (!trigger.value) { return; }` — e2e/src/components/computed/computed.tsx<br>`if (isServer) { untrack(() => store.logs += "BEFORE useServerMount1()\n"); await` — e2e/src/components/mount/mount.tsx |
| 9 | member (plain chain, root loop) | 80 | `m.key` — preloader-test/src/components/router-head/router-head.tsx<br>`b.text` — qwikrouter-test/src/components/breadcrumbs/breadcrumbs.tsx |
| 10 | stmt:expr call:global console.log | 75 | `console.log("render");` — e2e/src/components/resource/resource-serialization.tsx<br>`console.log("rerender");` — e2e/src/components/resource/weather.tsx |
| 11 | binary (===) | 72 | `state.count % 2 === 0` — e2e/src/components/broadcast-events/broadcast-event.tsx<br>`signal.value === value` — e2e/src/components/context/context.tsx |
| 12 | identifier (loop) | 69 | `index` — e2e/src/components/context/context.tsx<br>`i` — e2e/src/components/styles/styles.tsx |
| 13 | array-literal | 67 | `[1, 2]` — e2e/src/components/context/context.tsx<br>`[ "\b: backspace", "\f: form feed", "\n: line feed", "\r: carriage return", " : ` — e2e/src/components/lexical-scope/lexicalScope.tsx |
| 14 | member (plain chain, root param) | 65 | `row.id` — perf.prod/src/components/signal-impl-each/index.tsx<br>`item.text` — qwikrouter-test/src/components/menu/menu.tsx |
| 15 | template-literal | 63 | `'issue2087_symbol_${id}'` — e2e/src/components/context/context.tsx<br>`'issue-3948-${props.name}'` — e2e/src/components/events/events.tsx |
| 16 | call:identifier(import) | 59 | `$((event) => { mousePosition.x = event.clientX; mousePosition.y = event.clientY;` — e2e/src/components/broadcast-events/broadcast-event.tsx<br>`$(() => { count.value++; })` — e2e/src/components/events/events.tsx |
| 17 | conditional | 56 | `props.active ? "true" : "false"` — e2e/src/components/context/context.tsx<br>`resource.pending ? "pending" : "resolved"` — e2e/src/components/resource/resource.tsx |
| 18 | qrl-block-stmt stmt:expr assign:x.value (=) | 54 | `context.descId.value = "final-id";` — e2e/src/components/backpatching/backpatching.tsx<br>`json.value = JSON.stringify({ isServer, isBrowser, isDev: build.isDev, buildIsSe` — e2e/src/components/build-variables/build.tsx |
| 19 | qrl-block-stmt stmt:expr assign:member (=) | 47 | `mousePosition.x = event.clientX;` — e2e/src/components/broadcast-events/broadcast-event.tsx<br>`store.hoverOrderLog = store.hoverOrderLog ? '${store.hoverOrderLog}\|red mouse ou` — e2e/src/components/events/events.tsx |
| 20 | call:identifier(module) | 47 | `mutable(state.count + 0)` — e2e/src/components/resource/resource.tsx<br>`coerceBoolean(sig.value)` — e2e/src/components/slot/slot.tsx |
| 21 | qrl-block-stmt stmt:return (object-literal) | 46 | `return { "data-nu": String(count.value), class: 'class-${count.value}' };` — e2e/src/components/computed/computed.tsx<br>`return { url, html: await res.text() };` — e2e/src/components/containers/container.tsx |
| 22 | identifier (param) | 43 | `value` — e2e/src/components/context/context.tsx<br>`props` — e2e/src/components/factory/utils.tsx |
| 23 | qrl-block-stmt stmt:expr call:identifier(param) | 36 | `cleanup(() => { delete globalThis[resolveName]; delete globalThis[pendingName]; ` — e2e/src/components/suspense/suspense.tsx<br>`cleanup(() => { props.root.logs += "ToggleA()"; });` — e2e/src/components/toggle/toggle.tsx |
| 24 | identifier (import) | 34 | `CounterContext` — preloader-test/src/components/generated/counter4-child.tsx<br>`childContext` — preloader-test/src/components/generated/counter4-grandchild.tsx |
| 25 | optional-chain (MemberExpression) | 34 | `action.value?.success` — preloader-test/src/routes/form/index.tsx<br>`signIn.value?.message` — qwikrouter-test/src/routes/(common)/(auth)/sign-in/index.tsx |
| 26 | stmt:if | 27 | `if (isServer) { const releaseId = getSearchParam(url, "release"); if (releaseId ` — e2e/src/components/suspense/suspense.tsx<br>`if (Implementation) { return <Implementation />; }` — perf.prod/src/root.tsx |
| 27 | qrl-block-stmt stmt:expr await | 24 | `await delay(10);` — e2e/src/components/async/async.tsx<br>`await new Promise((resolve) => { setTimeout(resolve, 60); });` — e2e/src/components/events/events.tsx |
| 28 | jsx | 23 | `<pixel.internetnetworkarrowsync class={navPillIconClass} />` — docs/components/header/desktop-header.tsx<br>`<span class="absolute inset-0 bg-gradient-text-shimmer animate-shimmer opacity-7` — docs/components/home/hero.tsx |
| 29 | call:global JSON.stringify | 22 | `JSON.stringify(a)` — e2e/src/components/lexical-scope/lexicalScope.tsx<br>`JSON.stringify(pageData.value)` — qwikrouter-ssg-snapshot/src/routes/index.tsx |
| 30 | qrl-block-stmt stmt:expr member (x.value chain, root local) | 22 | `count.value;` — e2e/src/components/resource/resource-serialization.tsx<br>`count.value;` — preloader-test/src/components/generated/counter4-child.tsx |
| 31 | qrl-block-stmt stmt:expr call:global console.log | 21 | `console.log("changed");` — e2e/src/components/toggle/toggle.tsx<br>`console.log(path);` — e2e/src/components/watch/watch.tsx |
| 32 | logical (\|\|) | 21 | `loc.url.searchParams.get("unit") \|\| "C"` — qwikrouter-test/src/routes/(common)/[country]/[city]/index.tsx<br>`frontmatter.contributors \|\| []` — docs/components/contributors/index.tsx |
| 33 | qrl-expr-body jsx | 18 | `<span id="single-fallback">Loading single</span>` — e2e/src/components/suspense/suspense.tsx<br>`<tr class={row.selected.value ? "danger" : ""}> <td class="col-md-1">{row.id}</t` — perf.prod/src/components/signal-impl-each/index.tsx |
| 34 | member (plain chain, root import) | 17 | `styles.processing` — qwikrouter-test/src/routes/(common)/actions/login.tsx<br>`EAGER_TRANSITIVE_BLOCKS.product` — qwikrouter-test.prod/src/shared/eager-transitive-generator.tsx |
| 35 | binary (+) | 16 | `"stuff: " + state.stuff` — e2e/src/components/attributes/attributes.tsx<br>`"" + state.result` — e2e/src/components/lexical-scope/lexicalScope.tsx |
| 36 | stmt:expr member (x.value chain, root local) | 16 | `action1.value;` — qwikrouter-test/src/routes/(common)/actions/validated/index.tsx<br>`action1.value;` — qwikrouter-test/src/routes/(common)/actions/validated/index.tsx |
| 37 | unary (!) | 15 | `!!t.value` — e2e/src/components/context/context.tsx<br>`!state.removeContent` — e2e/src/components/slot/slot.tsx |
| 38 | call:identifier(unresolved/global) | 15 | `String(bindEnabled.value)` — e2e/src/components/events/events-client.tsx<br>`String(d)` — e2e/src/components/lexical-scope/lexicalScope.tsx |
| 39 | new | 15 | `new FormData()` — e2e/src/components/lexical-scope/lexicalScope.tsx<br>`new Promise((resolve) => { globalThis[props.resolveName] = () => { delete global` — e2e/src/components/suspense/suspense.tsx |
| 40 | qrl-block-stmt stmt:expr call:identifier(import) | 15 | `untrack(() => store.logs += "BEFORE useMount2()\n");` — e2e/src/components/mount/mount.tsx<br>`untrack(() => logs.content += "[WATCH] 1 before\n");` — e2e/src/components/resource/resource.tsx |
| 41 | logical (??) | 15 | `open ?? false` — preloader-test/src/components/headless/collapsible/collapsible.tsx<br>`givenShowSig ?? defaultShowSig` — preloader-test/src/components/headless/modal/modal-root.tsx |
| 42 | optional-chain (CallExpression) | 14 | `item.items?.map((item) => <li key={item.href}> <Link data-test-menu-link={item.h` — qwikrouter-test/src/components/menu/menu.tsx<br>`other.formData?.get("username")` — qwikrouter-test/src/routes/(common)/actions/index.tsx |
| 43 | qrl-block-stmt stmt:throw | 13 | `throw new Error("This is a useTask$ error");` — e2e/src/components/exceptions.tsx<br>`throw new Error("failed");` — e2e/src/components/resource/resource-serialization.tsx |
| 44 | helper stmt:expr function-expression | 12 | `({ render }) => { describe("<UseOnWindowConditionalRenderIssue3948/>", () => { l` — e2e/src/components/events/events.e2e.tsx<br>`() => { return <div>A</div>; }` — e2e/src/components/factory/factory.tsx |
| 45 | qrl-expr-body assign:x.value (=) | 12 | `data.value = buildData(1e3)` — perf.prod/src/components/server-impl/index.tsx<br>`data.value = buildData(1e3)` — perf.prod/src/components/signal-impl/index.tsx |
| 46 | qrl-block-stmt stmt:return (literal) | 11 | `return "Success";` — e2e/src/components/resource/resource-serialization.tsx<br>`return "hello from worker";` — e2e/src/components/worker/worker.tsx |
| 47 | function-expression | 11 | `(itemIds) => { const activeId = useSignal(null); useOnDocument("scroll", $(() =>` — docs/components/on-this-page/on-this-page.tsx<br>`() => { const initStore = { replId: Math.round(Math.random() * Number.MAX_SAFE_I` — docs/repl/ui/index.tsx |
| 48 | logical (&&) | 9 | `!signal.value && "moop"` — e2e/src/components/attributes/attributes.tsx<br>`props.level >= MAX_DEPTH && children.length` — e2e/src/components/useid/useid.tsx |
| 49 | binary (%) | 8 | `render.value % 2` — e2e/src/components/attributes/attributes.tsx<br>`count.value % 2` — e2e/src/components/context/context.tsx |
| 50 | member (computed) | 8 | `props["data-nu"]` — e2e/src/components/computed/computed.tsx<br>`state[0]` — e2e/src/components/signals/NakedObjectStoreReactivityIssue5001.tsx |
| 51 | qrl-block-stmt stmt:try | 8 | `try { focusTrap?.activate(); } catch {}` — preloader-test/src/components/headless/modal/use-modal.tsx<br>`try { await serverError(); } catch (err) { if (err instanceof ServerError && typ` — qwikrouter-test/src/routes/(common)/server-func/server-error/loader/index.tsx |
| 52 | call:member on member chain .filter | 8 | `todos.items.filter(FILTERS[todos.filter])` — todo-old-test/src/components/body/body.tsx<br>`todos.items.filter(FILTERS[todos.filter])` — todo-test/src/components/body/body.tsx |
| 53 | qrl-expr-body literal | 7 | `"Hello"` — e2e/src/components/computed/computed.tsx<br>`0` — e2e/src/components/qrl/qrl.tsx |
| 54 | binary (>) | 7 | `signal.value > 0` — qwikrouter-test/src/routes/issue-loader-serialization/index.tsx<br>`contentHeadings.length > 0` — docs/components/on-this-page/on-this-page.tsx |
| 55 | qrl-expr-body call:identifier(unresolved/global) | 7 | `alert("Hello World!")` — docs/routes/tutorial/events/programmatic/solution/app.tsx<br>`alert("Good Bye!")` — docs/routes/tutorial/props/closures/problem/app.tsx |
| 56 | identifier (unresolved) | 6 | `undefined` — e2e/src/components/lexical-scope/lexicalScope.tsx<br>`undefined` — docs/components/content-nav/content-nav.tsx |
| 57 | qrl-expr-body call:global Promise.resolve | 6 | `Promise.resolve({ name: "asyncSignal" })` — e2e/src/components/resource/resource-fn.tsx<br>`Promise.resolve(count.value * 2)` — e2e/src/components/use-async/use-async.tsx |
| 58 | qrl-block-stmt stmt:return (identifier (local)) | 6 | `return value;` — e2e/src/components/resource/resource-serialization.tsx<br>`return value;` — e2e/src/components/resource/weather.tsx |
| 59 | qrl-block-stmt stmt:return (function-expression) | 6 | `return () => { clearTimeout(timer); };` — e2e/src/components/resource/weather.tsx<br>`return () => { clearTimeout(timer); };` — e2e/src/components/watch/watch.tsx |
| 60 | qrl-block-stmt stmt:return (call:identifier(module)) | 6 | `return helloBar(hello);` — qwikrouter-test/src/routes/issue7254/index.tsx<br>`return getRepositories(org, abortSignal);` — docs/routes/tutorial/introduction/resource/problem/app.tsx |

Tail (138 more constructs, 259 rows): binary (!==)=6, qrl-block-stmt stmt:return (await)=6, qrl-block-stmt stmt:return (jsx)=5, stmt:return (identifier (local))=5, qrl-block-stmt stmt:return (binary (+))=5, qrl-block-stmt stmt:expr update:x.value (++)=5, member (x.value chain, root loop)=5, qrl-block-stmt stmt:return (array-literal)=5, qrl-expr-body call:identifier(param)=5, qrl-expr-body binary (*)=4, qrl-expr-body binary (+)=4, qrl-expr-body update:MemberExpression (++)=4, qrl-expr-body new=4, qrl-block-stmt stmt:loop(ForStatement)=4, stmt:return (object-literal)=4, call:member on signal.value chain .toISOString=4, qrl-block-stmt stmt:return (call:identifier(param))=4, stmt:switch=4, stmt:expr assign:member (=)=4, stmt:expr assign:local (=)=4, qrl-block-stmt stmt:expr call:identifier(unresolved/global)=3, helper stmt:function-decl=3, qrl-block-stmt stmt:expr call:global console.assert=3, stmt:expr call:member on local identifier .append=3, qrl-block-stmt stmt:return (conditional)=3, qrl-block-stmt stmt:return (template-literal)=3, qrl-block-stmt stmt:expr call:member on member chain .add=3, qrl-block-stmt stmt:return (call:identifier(import))=3, qrl-expr-body object-literal=3, stmt:expr identifier (local)=3, qrl-block-stmt stmt:var let=3, qrl-block-stmt stmt:expr call:member on local identifier .push=3, qrl-block-stmt stmt:return (member (plain chain, root ThisExpression))=3, qrl-block-stmt stmt:expr call:other(CallExpression)=3, qrl-expr-body logical (&&)=3, call:member on member chain .join=3, call:identifier(local)=2, stmt:expr update:MemberExpression (++)=2, qrl-block-stmt stmt:return (binary (*))=2, call:global Array.from=2, qrl-block-stmt stmt:expr assign:local (=)=2, call:member on signal.value chain .join=2, member (x.value chain, root CallExpression)=2, call:member on local identifier .map=2, binary (!=)=2, qrl-block-stmt stmt:expr member (plain chain, root local)=2, call:member on call result .map=2, qrl-block-stmt stmt:return (logical (&&))=2, qrl-expr-body member (x.value chain, root local)=2, qrl-block-stmt stmt:expr call:member on member chain .remove=2, qrl-block-stmt stmt:expr call:member on param identifier .preventDefault=2, member (plain chain, root CallExpression)=2, call:member on import identifier .filter=2, qrl-block-stmt stmt:expr conditional=2, call:member on call result .then=1, stmt:expr member (plain chain, root local)=1, qrl-block-body (empty)=1, stmt:expr call:identifier(module)=1, qrl-expr-body assign:member (+=)=1, stmt:throw=1, call:member on local identifier .then=1, qrl-block-stmt stmt:expr call:member on local identifier .catch=1, call:member on call result .join=1, stmt:expr call:global Object.freeze=1, call:global Promise.resolve=1, call:global Promise.reject=1, stmt:expr call:member on local identifier .catch=1, literal=1, call:global Object.create=1, stmt:expr assign:x.value (=)=1, unary (-)=1, qrl-block-stmt stmt:expr member (x.value chain, root param)=1, qrl-block-stmt stmt:expr call:identifier(local)=1, qrl-block-stmt stmt:expr call:member on param identifier .addEventListener=1, qrl-block-stmt stmt:return (new)=1, call:member on param identifier .toLowerCase=1, member (x.value chain, root param)=1, call:member on call result .sort=1, call:member on loop identifier .replace=1, qrl-block-stmt stmt:expr call:global Object.assign=1, qrl-block-stmt stmt:expr call:member on param identifier .after=1, qrl-block-stmt stmt:expr call:member on local identifier .remove=1, qrl-block-stmt stmt:expr optional-chain (CallExpression)=1, qrl-block-stmt stmt:expr call:member on param identifier .showModal=1, call:member on call result .superRefine=1, qrl-block-stmt stmt:expr call:global console.warn=1, member (x.value chain, root import)=1, qrl-expr-body call:member on param identifier .object=1, qrl-expr-body call:member on local identifier .submit=1, qrl-block-stmt stmt:return (identifier (param))=1, stmt:expr call:global console.warn=1, call:member on local identifier .getUTCFullYear=1, qrl-block-stmt stmt:expr call:member on param identifier .set=1, binary (==)=1, qrl-block-stmt stmt:return (call:member on member chain .get)=1, qrl-block-stmt stmt:return (binary (===))=1, qrl-block-stmt stmt:return (logical (\|\|))=1, qrl-block-stmt stmt:return (identifier (unresolved))=1, call:member on local identifier .includes=1, qrl-block-stmt stmt:return (call:member on call result .then)=1, qrl-expr-body template-literal=1, call:member on member chain .toString=1, call:member on member chain .getFullYear=1, qrl-expr-body binary (===)=1, qrl-block-stmt stmt:expr call:member on member chain .writeText=1, qrl-block-stmt stmt:expr call:member on param identifier .forEach=1, member (plain chain, root MetaProperty)=1, qrl-expr-body call:member on signal.value chain .trim=1, qrl-expr-body binary (>=)=1, qrl-expr-body logical (\|\|)=1, qrl-expr-body binary (>)=1, call:member on member chain .replace=1, call:member on member chain .some=1, qrl-block-stmt stmt:expr call:identifier(module)=1, call:member on param identifier .filter=1, call:member on import identifier .find=1, binary (<)=1, qrl-expr-body identifier (param)=1, stmt:expr call:member on import identifier .sort=1, call:global Math.round=1, qrl-expr-body member (plain chain, root param)=1, qrl-block-stmt stmt:return (member (computed))=1, stmt:return (call:identifier(import))=1, call:member on module identifier .[computed]=1, qrl-expr-body call:identifier(local)=1, qrl-block-stmt stmt:expr logical (&&)=1, qrl-block-stmt stmt:expr call:member on member chain .push=1, qrl-block-stmt stmt:return (member (plain chain, root local))=1, call:member on signal.value chain .filter=1, stmt:expr call:member on param identifier .forEach=1, qrl-expr-body update:x.value (++)=1, qrl-block-stmt stmt:return (call:member on param identifier .get)=1, qrl-block-stmt stmt:return (logical (??))=1, qrl-block-stmt stmt:return (call:member on signal.value chain .toUpperCase)=1, qrl-block-stmt stmt:expr call:member on call result .then=1, qrl-expr-body binary (!==)=1, qrl-block-stmt stmt:return (call:member on member chain .map)=1, qrl-block-stmt stmt:expr call:member on local identifier .forEach=1

Coarse buckets: member=657, identifier=563, object-literal=280, call:identifier(import)=222, stmt:return=139, binary=125, stmt:var const=123, stmt:if=118, call:global console.log=96, call:member=70, assign:x.value=67, array-literal=67, template-literal=64, conditional=58, assign:member=52, logical=50, call:identifier(module)=49, optional-chain=49, jsx=41, call:identifier(param)=41, call:identifier(unresolved/global)=25, await=24, function-expression=23, call:global JSON.stringify=22, new=19, unary=16, stmt:throw=14, literal=8, stmt:try=8, call:global Promise.resolve=7, update:MemberExpression=6, update:x.value=6, assign:local=6, call:identifier(local)=4, stmt:loop(ForStatement)=4, stmt:switch=4, stmt:function-decl=3, call:global console.assert=3, stmt:var let=3, call:other(CallExpression)=3, call:global Array.from=2, call:global console.warn=2, qrl-block-body=1, call:global Object.freeze=1, call:global Promise.reject=1, call:global Object.create=1, call:global Object.assign=1, call:global Math.round=1

Owners: component=754, implicit:expression=673, implicit:hook=513, implicit:branch=349, implicit:for=239, explicit=166, helper=163, implicit:projection=136, implicit:jsx-value=49, implicit:prop=48, implicit:content=24, hook:useMousePosition=6, hook:useDocumentMouse=5, hook:useWindowMouse=5, hook:useSelfMouse=5, implicit:function=4, hook:useCloseDropdown=2, implicit:tag:dynamic=2, hook:useCollapsible=1, hook:useModal=1, implicit:slot:dynamic=1, hook:useMDXComponents=1, hook:useDebouncer=1, implicit:jsx-factory=1

Member-call method names: log=96, stringify=22, filter=12, resolve=7, join=6, map=5, then=4, toISOString=4, push=4, assert=3, append=3, remove=3, add=3, forEach=3, from=2, catch=2, sort=2, replace=2, warn=2, get=2, preventDefault=2, freeze=1, reject=1, create=1, addEventListener=1

Await holes by owner: implicit:hook/useTask$=17, implicit:hook/useComputed$=13, implicit:hook/routeLoader$=15, helper=23, explicit/$=6, implicit:hook/globalAction$=2, implicit:hook/server$=3, implicit:function/stuff=1, implicit:function/resolve=1

Helper (`AssemblyKind.Payload`) roots in real code are almost all marker calls in expression
position: `routeLoader$` 68, `routeAction$` 30, `server$` 20, `globalAction$` 10, `qwikify$` 8,
`worker$` 4, `factory$` 3, `validator$` 2, `zod$` 1, `$` 1; 12 are bare function expressions
(`e2e.tsx` test helpers, `factory.tsx`) and 3 are function declarations. Their callbacks are
*also* counted as `implicit:hook` QRL holes, so an `await` inside `routeLoader$(async () => …)`
appears once under `qrl` and once under `helper` (the 23 helper awaits are that overlap).

`QrlBodyKind.Js` bodies in real code: 93 expression bodies, 305 block bodies; blocks have 1
statement (154), 2–3 (111), 4–6 (33), 7+ (7).

`SetupKind.Js` statements in real code (157): `console.log(...)` 75, `if` 27, bare member-read
statements (`count.value;`, `state.stuff;` — subscription taps) 17, `return` 10, `switch` 4,
member/local assignment 8, `formData.append` 3, bare identifier 3, `x.y++` 2, `throw` 1.

## Top member-call method names

- real: `console.log` 96, `JSON.stringify` 22, `.filter` 12, `Promise.resolve` 7, `.join` 6,
  `.map` 5, `.then` 4, `.toISOString` 4, `.push` 4, `console.assert` 3, `.append` 3,
  `classList.remove/add` 3+3, `.forEach` 3, `Array.from` 2, `.catch` 2, `.sort` 2, `.replace` 2,
  `console.warn` 2, `.get` 2, `.preventDefault` 2, then singletons (`Object.freeze/create/assign`,
  `Promise.reject`, `addEventListener`, `toLowerCase`, `showModal`, `superRefine`, `Math.round`).
- fixtures: `console.log` 6, `.filter` 2, `JSON.stringify`, `.toUpperCase`, `Promise.resolve`,
  `[1].map`, `props.onSave$`, `date.value.getFullYear` 1 each.

Member calls are a small class overall: 70 rows in real (2.2 %), 6 in fixtures. String-literal
and object-literal receivers never occur; the one array-literal receiver is `[1].map(...)`
(explicit-qrl-anywhere).

## Observations

1. **The largest server-reachable hole class is not an operator or a call — it is a bare
   identifier or non-computed member chain rooted at a component-body local.** Real:
   `identifier (local)` 271 + `member (…, root local)` 430 = 701 of 2097 `ExprKind.Js` (33 %);
   plus `loop`/`param`/`module`/`import`/`this`/call roots another 461 (22 %) — 1171 (56 %) in
   all. Fixtures: 104 + 92 = 196 of 370 (53 %).
   These shapes are inside `tryLowerExprIr`'s vocabulary (`analyse/lower-expr.ts:357-398`
   accepts `Identifier` and non-computed `MemberExpression`), but `localReadIr`
   (`analyse/locals.ts:53-59`) returns IR **only** for `LocalKind.RowIndex` and
   `LocalKind.PropMember`; `Const`, `Mutable`, `Signal`, `Store`, `LoopValue` locals return
   `null`, and module/import/unresolved bindings are not in `ctx.locals` at all. So roughly half
   of every Js expression hole is gated by binding-kind coverage in one function, not by missing
   `ValueIR` vocabulary.
2. **Object and array literals are next** (real 277 + 67, fixtures 23 + 62): `useStore({...})`
   / `useSignal([...])` initialisers, `class={[...]}` / `style={{...}}` values and literal
   collection sources (`lower-array.ts:394` keeps `[...]` inline on purpose). `ValueIrKind.Object/
   Array` exist in `src/expr-ir.ts` but `tryLowerExprIr` never produces them.
3. **Operators** in expression position (real: `binary` 113, `template-literal` 63,
   `conditional` 56, optional chains 48, `logical` 45, `unary` 16 = 341, 16 %; fixtures 53,
   14 %) come next; every one has a
   `ValueIrKind` arm already (`Bin/Cond/Template/Logic/Unary/Member{optional}`).
4. **Calls in expression position** are dominated by `$()`-family and marker imports
   (`call:identifier(import)` 59 + 148 helpers), module-local helpers (47), globals such as
   `String()`/`JSON.stringify` (43) and `new` (15); generic member-method calls are rare (40 in
   expression position, 70 rows including statements). A `ValueIrKind.Call` covering identifier
   callees plus the handful of globals would clear most of it.
5. **Statement holes** (`QrlBodyKind.Js` blocks + `SetupKind.Js`) are, in order: `const`
   declarations 123, `if` 91 + 27, `x.value = …` 54, `store.x = …` 47, `return {…}` 46,
   `cleanup(...)`-style parameter calls 36, `console.log` 21 + 75, `await …;` 24, `throw` 13, `try` 8, `for` 4,
   `switch` 4, `let` 3. That set (`Let/If/SetSignal/SetStore/Return/Await/CallPlugin/
   RegisterCleanup`) is exactly the unproduced `TaskStepKind` vocabulary in `schema/value.ts:91-118`;
   `throw`/`try`/`for`/`switch`/`console.*` are the only constructs outside it (≈ 10 % of statement
   rows).
6. **`await` is rare**: 81 of 2815 real holes (2.9 %), all in `useTask$` (17), `routeLoader$` (15),
   `useComputed$` (13), `server$` (3), `globalAction$` (2), `$()` (6) callbacks and their helper
   envelopes; fixtures 6 of 456. Every awaited hole is a task/loader-style QRL body — none are
   render expressions or setup statements (the single fixture setup await is `jsx-async`'s
   `const create = async …` declaration).
7. Owner mix differs between corpora: fixtures are row/key heavy (`implicit:for` 102 of 472
   rows, 22 %) while real code is expression/hook heavy (`implicit:expression` 673, `implicit:hook`
   513 of 3149). Ranking by construct is stable across both — identifier/member, literals,
   operators, then `$`-family calls — so the fixture bias is in *where* holes sit, not *what* they
   contain.
