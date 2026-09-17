# 06 — Inventory of Js bodies in the pipeline

Ticket: `../issues/06-js-body-inventory.md`. Repo root `/home/michal/Dokumenty/git/qwik`; all paths
below are relative to `packages/compiler/pipeline/` unless absolute. Line numbers are from the
working tree on 2026-09-17 (branch `v3`, HEAD `e38ad703a`).

Method: grepped `QrlBodyKind.Js`, `HookBodyKind.Js`, `SetupKind.Js`, `ExprKind.Js`,
`QrlPayloadKind`, `pushPayload`/`lowerExpressionPayload` across `analyse/`, `link/`, `generate/`,
`schema/`; read each producer's enclosing function and each consumer; ran `analyseModule` over the
`==INPUT==` of all 216 `tests/snapshots/*.ssr.snap` fixtures with a scratch script
(`/tmp/claude-1000/-home-michal-Dokumenty-git-qwik/836e6904-e7e7-43e6-8a39-ec7571fcc2ea/scratchpad/count-js.mts`,
output in `count-js.out` beside it) and counted plan bodies per kind.

## 1. Payload-level finding (decides ticket 07)

**A `Payload` is a source *range*, not source text, and it is never JS-only: it is the carrier of
every IR island that lives inside authored code.** Precisely:

- `schema/value.ts:21-44` — `Payload { range: Range; text?: string; constants; qrls; reads;
  awaits; useIds; renders; setups?; temps }`. `range` is required; `text` is optional and
  commented "Text materialized at serialization".
- `text` is **never written anywhere** in the pipeline: `grep -rn "\.text = \|payload.text"
  analyse link generate schema compat` matches only `generate/assemble-module.ts:188`
  (an unrelated edit record). `analyse/lower-context.ts:96-108` `pushPayload` creates the record
  with `range` and empty arrays only. DESIGN.md `LinkedModule.payloads` says "text materialized;
  reads/awaits/qrls intact" (`DESIGN.md:577`) — that materialization does not exist; generators
  slice `module.source.code` by range at emit time (`generate/emit-chunk.ts:407-471`
  `extractPayloadJs`, final `applyReplacements(module.source.code, range, replacements)` at
  line 470).
- **Not every body is JS text at the payload level.** The three IR-bodied QRL arms carry no
  payload at all: `Qrl.body` is a discriminated union `Program | Task | Expr | Js`
  (`schema/module-plan.ts:85-94`); only the `Js` arm holds a `payload: PayloadId`. A
  `Program`-bodied component (`analyse/analyse-module.ts:281`) has no source payload for its body;
  its render is `Op[]`. Likewise `SetupKind.Const/Call/Style/...` carry `Value`/`ValueIR`, not
  payloads (`schema/program.ts:329-409`).
- **But IR is never *alongside* a Js body either — it is *inside* it.** A Js payload is a shell
  whose holes are IR: `renders[]` → `Program` ids, `setups[]` → nested `Setup[]`, `qrls[]` →
  `QrlUse`, `reads[].value` → `ValueIR`, `awaits[]` → `_await` restoration points
  (`schema/value.ts:27-43`). The generator prints the shell by slicing source and splicing IR
  emissions into the holes (`generate/emit-setup.ts:95-117`, `generate/emit-chunk.ts:407-471`).
- **Every `Expr` gets a payload pushed even when IR wins.** `analyse/lower-expr.ts:115-117`
  (`lowerComputedExpressionValue`) and `:244-250` (`lowerInlineExpressionValue`) call
  `lowerExpressionPayload` unconditionally and then pick `ir === null ? {Js, payload} : {Ir, ir}`;
  when IR wins the payload id is orphaned in `plan.payloads` (still referenced by nothing). So at
  the *plan* level "JS text alongside IR" is true only as an unreferenced side record for
  expressions; the `Expr` value itself is one-or-the-other.
- Secondary payload holes that are *always* source text (no IR form, no discriminant):
  `BindTarget.Pattern.pattern` (`schema/program.ts:248`), `ComponentParameter.pattern`
  (`:417`), `HookDecl.parameters[].pattern` (`schema/module-plan.ts:167`), `Qrl.params.sources`
  (`:103`, never populated — every producer writes `sources: []`), `Qrl.propsParts` Expression/
  Spread (`:118-119`), `Setup.Style.css.dynamic` (`schema/program.ts:378`),
  `ModulePlan.callables/values/natives.jsImplementation` (`schema/module-plan.ts:235-243`, never
  populated — `analyse/plan.ts:16-20` initialises them empty and nothing pushes), task cleanup
  `{ js: PayloadId }` (`schema/value.ts:116,118`, no producer), and `AssemblyKind.Payload`
  module-level statements (`schema/module-plan.ts:312`, produced at
  `analyse/analyse-module.ts:184-189` for every non-component top-level helper root).

Bottom line for ticket 07: a "payload" is a *span + hole table*, materialised by slicing the
retained `ModuleSource.code`. Cutting Js bodies means replacing the `Js` arms with IR **and** the
hole table's owners (renders/setups/qrls/reads/awaits) become direct children of that IR; the
`Payload` record itself does not need a `text` field and never had one in practice.

## 2. DESIGN.md — rule 5 and the Payload section (quoted)

`DESIGN.md:30-32`:

> 5. JS is the baseline: payloads are native format for JS generators; generators validate by
>    **exhaustively matching linked leaf variants** — an unsupported variant is an explicit error
>    arm with a stable code, not a registry lookup, so nothing can be silently ignored.

`DESIGN.md:80-101` (Payload):

> // ---------- payloads ------
> // Source text + references. Executable, and RESTORABLE: awaits live here so EVERY callable body
> // (components, custom hooks, plain callables — not only tasks) keeps its `_await`
> // tracking/invoke-context restoration points. No `environment` field — browser/server
> // reachability is a LINKED use-edge fact, never decided per-file (one `$()` can feed both a
> // browser event and a server computed).
> interface Payload {
>   range: Range;
>   text?: string; // text materialized at serialization
>   constants: { range: Range; name: 'isServer' | 'isBrowser' | 'isDev' }[];
>   qrls: { range: Range; use: QrlUse }[];
>   reads: { range: Range; binding: LocalId; role: 'read' | 'write' | 'call' | 'shorthand'; value?: ValueIR; }[];
>   awaits: { range: Range; argumentRange: Range }[];
>   useIds: { range: Range; ordinal: number }[];
>   renders: { range: Range; program: ProgramId }[];
>   temps: { binding: LocalId; statementStart: number; init: PayloadId }[];
> }

`DESIGN.md:577` (LinkedModule): `payloads: Payload[]; // text materialized; reads/awaits/qrls intact`

`DESIGN.md:767` (coverage table): "component body / arm / row / projection / fallback / embedded /
local component → `Program` table entry; **envelope survives `js` bodies**" and `:775`: "`$()`
bodies of every kind → `Qrl.body` union + `awaits` on `Payload` (restoration everywhere)".

The same file's `HookDecl.body` (`DESIGN.md:421`) and `Setup` (`:329`) list the `js` arms as
designed fallbacks: "`{ s: 'js'; payload: PayloadId; guard?: Predicate }; // runtime needs derive
from the` payload rewrites". So the design intends Js as the *baseline generator format*, with IR
arms added "as examples demand them" (`generate/emit-chunk.ts:236`).

## 3. Producers — `QrlBodyKind.Js`

Exactly **one** producer: `analyse/lower-function.ts:94` inside `lowerFunctionQrl`
(`:55-115`). Everything that reaches `lowerFunctionQrl` with an inline `ArrowFunctionExpression`
or `FunctionExpression` becomes a Js body; the payload is `[fn.start, fn.end]` (`:80`), then
`recordPayloadReads` (`:81`), `recordPayloadQrls` (`:83`), `recordFunctionJsx` (`:84`) fill the
hole table.

| Call site → `lowerFunctionQrl` | Authored construct | `boundary/ctxName` (from fixture run) | IR form for the same construct? |
| --- | --- | --- | --- |
| `analyse/lower-event.ts:37` `lowerHandler` | `on*$={() => …}` / `onClick$={function…}` on elements (arrays flattened `:52-56`) | `implicit:event/onClick$` ×58, `onSave$` ×6, `onReset$`, `onDblClick$`, `window:onDblClick$`, `document:onScroll$`, `on-save$` | **None.** Handlers have no step IR; `TaskBody`/`TaskStep` (`schema/value.ts:87-118`) exists in the schema but has **zero producers** (`grep QrlBodyKind.Task analyse` → none). Non-function handler *values* (`increment` alias, member reads) go through `lowerInlineExpressionValue`/`lowerExpressionValue` (`lower-event.ts:28-35`) → `Expr`. |
| `analyse/lower-setup.ts:627` `lowerSetupCallback` via `lowerQrlArgument` (`lower-function.ts:38-53`) | `$(() => …)` explicit; `useTask$(…)`, `useComputed$(…)`, `useVisibleTask$(…)`, `useSerializer$(…)`, custom `useX$(…)` first-argument callbacks | `explicit/$` ×19, `implicit:hook/useTask$` ×8, `useComputed$` ×10, `useVisibleTask$` ×3, `useSerializer$` ×1, `useCustom$` ×7, `useLocal$` ×1 | **Partial.** The *call* is IR (`SetupKind.Call` + `CoreOperation.Task/CreateComputed/VisibleTask/Serializer`, `schema/program.ts:295-306`, produced at `lower-setup.ts:723`); the *callback body* is not. A non-function argument (identifier, call) becomes `QrlBodyKind.Expr` via `lowerComputedExpressionValue` (`lower-function.ts:52`). `TaskBody` is the designed IR for task callbacks but unproduced. `useComputed$` body has no IR arm; `lowerKeyBody` (`lower-array.ts:673-712`) shows the shape that *would* fit (`Program{body: Expr, setup, params}`). |
| `analyse/lower-setup.ts:412` `lowerLocalFunction.lift` via `lowerQrlArgument` | `function pick(){…}` / `const load = () => …` declared in component setup and later referenced from a `$` boundary | `implicit:function/pick`, `suffix`, `label`, `load` | **None** for the body; the *declaration* is IR (`SetupKind.LocalFunction`, `program.ts:392-399`). Never-lifted functions fall to `SetupKind.Js` instead (`lower-setup.ts:145-147`). |
| `analyse/lower-jsx.ts:1324` `lowerPropFactory` | Component prop whose value is a JSX factory, e.g. `render={() => <b/>}`, `onResolved={(v) => <i>{v}</i>}` | `implicit:jsx-factory/render`, `onResolved` | **Yes, for the JSX itself**: `recordFunctionJsx` (`lower-function.ts:119-142`) lowers the JSX inside to a `Program` and records it in `payload.renders`; only the function envelope is Js. |
| `analyse/lower-jsx.ts:1333` `lowerQrlProp` via `lowerQrlArgument` | `<Comp render$={() => …}>` — any `*$` prop on a component | `implicit:prop/render$` | Same as explicit `$`. |
| `analyse/lower-function.ts:307-338` `lowerMarkerQrl` (through `lowerQrlArgument`) | `sync$(() => …)` (`BoundaryKind.Sync`), `useOn*$`, custom-marker calls | `sync/sync$` ×2 | None; `sync$` additionally forbids captures/reads (`:325-334`). |

`QrlBodyKind.Expr` (`lower-expr.ts:169`, `lower-jsx.ts:605`, `lower-branch.ts:78`,
`lower-array.ts:682`, `link/link-content.ts:94`) and `QrlBodyKind.Program` (`analyse-module.ts:281`
components, `lower-array.ts:262,709` rows/keys, `lower-branch.ts:126` arms, `lower-jsx.ts:975,1210`
projections/embedded JSX) are the existing IR alternatives; the `Expr` arm can itself be
`ExprKind.Js` (section 6).

## 4. Producers — `SetupKind.Js`

Exactly **one** producer: `analyse/lower-setup.ts:592` at the end of `lowerJsStatement`
(`:512-593`). The payload is the whole statement `[statement.start, statement.end]` (`:518`); a
walker then carves IR holes: nested `VariableDeclaration`/`FunctionDeclaration`/
`ExpressionStatement` inside `if`/`while`/`do`/labeled blocks → `payload.setups[]` of re-lowered
`Setup[]` (`:536-554`), `return <jsx>` when `ctx.returnsRender` → `Program` in `payload.renders[]`
(`:559-577`), function-like nodes → `recordFunctionJsx` (`:555-558`), call/JSX expressions →
`recordPayloadJsx` (`:579-586`), `for/for-in/for-of` → `UnsupportedError` (`:527-533`).

Dispatch into `lowerJsStatement` from `lowerSetup` (`lower-setup.ts:128-190`):

| Line | Authored construct | IR form for the same construct? |
| --- | --- | --- |
| `:145-147` | `function name(){…}` declaration that no boundary ever lifts (`lowerLocalFunction`'s `lowerAuthored` fallback, `:395-430`) | `SetupKind.LocalFunction` when lifted; otherwise none |
| `:160-163` | Any statement that is **not** `const`, not `let/var` (those go to `lowerMutableDeclaration` `:225-249`), not a `function` declaration, and not an `ExpressionStatement` whose callee resolves to a `use*` hook (`:149-158`): `if`, `try`, `return` (in hooks/components), `throw`, labeled/while blocks, assignment statements (`count.value = 4`, `suffix += '!'`, `label.value = format(...)`), non-hook calls (`observe(...)`, `register(...)`, `consume(...)`) | `if` on render *values* has `Op.branch` (`lower-branch.ts`) but not on setup statements; assignments and plain calls have no Setup arm. Fixture run heads: `if` ×4, `label` ×3, `function` ×3, `return` ×3, `register` ×3, `consume` ×2, `observe` ×2, `doubled`, `content`, `action`, `count.value`, `label.value`, `suffix`, `try` |

Custom hooks (`analyse/lower-hook.ts:73`) and local components reuse `lowerSetup`, so the same
constructs inside them also produce `SetupKind.Js`.

## 5. Producers — `HookBodyKind.Js`

**Zero producers.** `grep -rn "HookBodyKind.Js" analyse` → none. `analyse/lower-hook.ts:73` always
pushes `HookBodyKind.Setup`; when lowering throws `UnsupportedError` the plan is rolled back with
`restorePlan` (`:80-81`, `:96-100`) and either the hook is left as authored source (no `HookDecl`
at all, `:136` `continue`) or, for hooks with a core contract, a synthetic
`HookBodyKind.Setup` with a single `SetupKind.Call` is pushed (`:138-160`). The schema arm
(`schema/module-plan.ts:171`) is dead on the producer side.

## 6. Producers — `ExprKind.Js` (the Js leaf inside `Expr`/`ValueIR`)

Not in the ticket's three kinds, but it is the fourth source-text hole and is by far the most
frequent (480 occurrences across the fixtures). `tryLowerExprIr` (`analyse/lower-expr.ts:357-398`)
only accepts literals, `-literal`, identifiers that resolve to props/locals, and non-computed
non-optional member chains; everything else is `null` → `ExprKind.Js`.

| Site | Construct | IR alternative |
| --- | --- | --- |
| `analyse/lower-expr.ts:117` (`lowerComputedExpressionValue`) | any JSX hole/attribute/prop expression beyond the `tryLowerExprIr` subset (calls, binary ops, templates, conditionals, `.map`, optional chains…) | `ValueIrKind` has `Unary/Bin/Logic/Cond/Template/Array/Object/Call/Index` (`packages/compiler/src/expr-ir.ts:11-30`) but `tryLowerExprIr` does not yet produce them |
| `analyse/lower-expr.ts:136` (`lowerTemplateValue`) | non-IR parts of mixed text `{a}{b}` | `ValueIrKind.Template` wraps them; parts stay Js |
| `analyse/lower-expr.ts:250` (`lowerInlineExpressionValue`) | `const x = <expr>` initialisers, hook return values, default values, handler aliases | same as above |
| `analyse/lower-array.ts:394` (`lowerSource`) | literal `[…]` collection source | none (deliberately inline) |
| `analyse/lower-jsx.ts:606` (`lowerPropsChunk`) | the component-props object chunk; `expr` points at the first part's payload, the real content rides `propsParts` (`:514,528`) | `PropsPartKind.Static/Event` are IR; `Expression/Spread` are payload ids |

## 7. Consumers — what happens to a Js body

| Consumer | Kind | Behaviour |
| --- | --- | --- |
| `generate/emit-function.ts:57-83` `sourceFunctionEmission` | `QrlBodyKind.Js` | `readSource = extractPayloadJs(module, body.payload, range, awaitName, [], emitQrl)` (`:65-68`). Named/anonymous `function` expressions with captures → `(<source>).apply(this, arguments)` (`:69-76`); `capturesBeforeParams` → `(...args) => (<source>)(...args)` (`:78-83`); otherwise params are sliced from `origin.paramRanges` (`:99-100`), block body sliced `[start+1,end-1].trim()` (`:102-106`), expression body sliced from `bodyRange` (`:113`). `awaits` add the `_await` import (`:57-63`). The output is the authored text with `qrls[]`, `reads[].value`, `awaits[]` spliced (`emit-chunk.ts:407-471`). |
| `generate/js-ssr.ts:370-377`, `generate/js-csr.ts:777-784` `qrlFunction` | `QrlBodyKind.Js` and `.Expr` | Both go to `contentFunctionEmission` (`emit-function.ts:160-174`) = `sourceFunctionEmission` plus a `renderSsrDynamicContent`/`createDynamicContent` wrapper for `role: 'content'`. SSR and CSR treat Js identically — the chunk is authored code either way. |
| `generate/js-ssr.ts:378`, `js-csr.ts:785` | `QrlBodyKind.Task` | `throw new UnsupportedError('a task QRL body')` — the IR arm has no generator either. |
| `generate/emit-setup.ts:95-117` `emitJsSetup` | `SetupKind.Js` | Nested `payload.setups[]` are re-emitted through `emitJsSetup` and spliced as edits (block-wrapped when `block`) (`:97-102`); `payload.renders[]` are rendered via the `render` callback and spliced as `return <emission>` or an IIFE (`:103-115`); then `extractPayloadJs(..., edits, emitQrl)` (`:117`). Shared by SSR (`js-ssr.ts:259`), CSR (`js-csr.ts:194,870`), expression programs (`emit-function.ts:91`), and hook bodies (`emit-setup.ts:400`). |
| `generate/emit-setup.ts:397-398` `emitHookBody` | `HookBodyKind.Js` | `throw new Error('pipeline: emitting the authored hook …')` — no generator support; consistent with zero producers. |
| `generate/emit-chunk.ts:239-240` `valueIrJs`, `:496-497` `expressionJs` | `ExprKind.Js` | `(${extractPayloadJs(module, ir.payload)})` — parenthesised source slice. |
| `generate/js-ssr.ts:198-212`, `js-csr.ts:132-146` `emitPayload` | `AssemblyKind.Payload` (module-level helpers) | `extractPayloadJs` with a marker-aware QRL emitter; SSR also flushes QRL hoists. |
| `generate/emit-function.ts:128-131` | `PropsPartKind.Expression/Spread` | `extractPayloadJs` per part. |
| `generate/emit-setup.ts:183-223` | `BindTarget.Pattern` | `extractPayloadJs(module, entry.result.pattern)` as the declarator target. |
| `link/qrl-dependencies.ts:320-321`, `:349-357` | `QrlBodyKind.Js`, `HookBodyKind.Js`, `SetupKind.Js` (`:176-177`) | `visitPayload` walks `reads`, `qrls`, `temps` to collect import dependencies — the linker reads only the hole table, never the text. |
| `link/link-hooks.ts:218-228` `flatSetup` | `SetupKind.Js` | Flattens nested `payload.setups[]` so hook facts (context provision, marker calls) are found inside Js statements. |
| `link/render-results.ts:145-155` | `SetupKind.Js` | Walks `payload.renders[]`/`setups[]` to mark active programs. `:770-772`: an `ExprKind.Js` value's result type is `payload.result ?? unknown`. |
| `link/link-plans.ts:377-379` `componentReadsChildren` | `Qrl.body` | Only `Program` bodies have setup facts; any other arm answers `false`. |
| `link/link-content.ts:74-78` | `ExprKind.Js` | Uses `payloads[expr.payload].range` as the synthetic content QRL's origin range. |

No consumer materialises `Payload.text`; every consumer slices `module.source.code`.

## 8. Fixture counts (analyser run over all 216 `*.ssr.snap` inputs)

Totals: `qrlJs=127`, `setupJs=27`, `exprJs=480`, `hookJs=0`; 11 module plans are `failed` by
design (the `children-contract-*`, `expression-hook-*`, `raw-text-live-value` diagnostic fixtures).

- **`QrlBodyKind.Js` — 74 fixtures** (34 %): attribute-class-style, capturing-event,
  children-descriptor-chunk, collection-alias-calls, collection-event-aliases,
  collection-param-array, collection-param-default-array, collection-param-default-identifier,
  collection-param-default-object, collection-param-object, collection-row-event-plain,
  collection-row-event, component-children-mapped-const-array,
  component-children-mapped-const-reactive, component-children-mapped-destructure-array,
  component-children-mapped-destructure-reactive, component-const-setup, component-event-prop,
  component-function-declarations, component-handler-array, component-marker,
  component-nested-params, component-prop-aliases, component-prop-defaults,
  component-props-reactive-spread-event, component-qrl-props, counter, custom-hook-bodies,
  element-inner-html, element-literal-spread, element-spread-props, event-alongside-static-attrs,
  event-block-body, event-function-handlers, event-handler-arrays, event-no-captures,
  event-parameter-patterns, event-props-captures, event-scopes-modifiers, event-with-param,
  explicit-qrl-anywhere, jsx-async, jsx-call, jsx-callback, jsx-factory-prop,
  jsx-function-context, jsx-structures, jsx-value, local-functions, marker-qrl-anywhere,
  mutable-qrl-event, nested-qrl-captures, ordinary-component-body, qrl-await, qrl-imports,
  qrl-module-bindings, setup-computed-async, setup-computed-chain, setup-computed-options,
  setup-computed, setup-context, setup-custom-hook, setup-hook-qrl, setup-live-aliases,
  setup-marker-hooks, setup-qrl, setup-serializer, setup-store, setup-styles, setup-task-hook,
  setup-task-wait, setup-use-on, setup-visible-task, sync-handlers.
- **`SetupKind.Js` — 11 fixtures**: collection-row-statements, component-binding-prop,
  custom-hook-bodies, jsx-assignment, jsx-async, jsx-call, jsx-callback, jsx-helper,
  mutable-qrl-event, nested-qrl-captures, ordinary-component-body.
- **`HookBodyKind.Js` — 0 fixtures.**
- **Any of the three — 78 fixtures** (36 % of 216).
- **`ExprKind.Js` — 121 fixtures** (56 %) — full list in `count-js.out`.

Cross-checks on the emitted SSR text: 159 `*.ssr.snap` files contain a `.js (ENTRY POINT)` chunk
(this also counts `Expr`-bodied computed/content QRLs), 111 import `_captures`, 5 import `_await`
(`qrl-await`, `setup-task-wait`, `setup-computed-async`, `jsx-async`, `setup-hook-qrl`). A Js body
has no printed marker of its own — it *is* the authored text (e.g. `counter.ssr.snap` chunk:
`export const component_q_e_click_segment_0_… = () => { const [count] = _captures; return
count.value++; };`; `qrl-await.ssr.snap`: `function () { const [count, props] = _captures; return
async function run(value = props.initial) { (await _await(Promise.resolve(value)))(); … }.apply(this,
arguments); }`), which is why the count above comes from re-running the analyser rather than
grepping output.

## 9. Observations for ticket 07

1. The Js holes are four, not three: `QrlBodyKind.Js` (1 producer), `SetupKind.Js` (1 producer),
   `ExprKind.Js` (5 producers, 480 hits), and the always-text payload ids (patterns, props parts,
   dynamic css, module helpers). `HookBodyKind.Js` and `QrlBodyKind.Task` are schema-only.
2. Every hole shares one printer, `extractPayloadJs`, and one dependency walker,
   `createDependencyCollector.visitPayload`. There is no per-kind text handling to migrate; the
   hole table (`reads/qrls/awaits/renders/setups/temps`) is the real interface.
3. The largest single construct behind `QrlBodyKind.Js` is the inline event handler (69 of 127);
   next are `$()`/hook callbacks (49). `SetupKind.Js` is dominated by control flow (`if`/`try`/
   `return`) and bare assignment/call statements in component setup.
4. `lowerKeyBody` (`lower-array.ts:673-712`) already builds `Program{body: Expr, setup, params}`
   for a callback with patterns and const declarations — the nearest existing IR envelope for a
   function body that is neither a render nor a task.
