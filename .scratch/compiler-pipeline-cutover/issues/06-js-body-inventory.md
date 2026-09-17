# Inventory of every producer of Js bodies in the pipeline
Type: research
Status: resolved
Blocked by:

## Question

`QrlBodyKind.Js`, `HookBodyKind.Js` and `SetupKind.Js` are the source-text holes. List every
site in `pipeline/analyse/**` that emits one, the authored construct that triggers it, and
whether the same construct already has an IR form elsewhere (`ValueIR`, `Program`, task
steps). Also list what the generators do with each. Output: a table per kind, plus a count of
current snapshot fixtures whose SSR output contains a Js body.

## Answer

Findings: `../research/06-js-body-inventory.md`.

1. One producer each: `QrlBodyKind.Js` at `analyse/lower-function.ts:94` (every inline function handed to a `$` boundary — 69/127 fixture hits are `on*$` handlers, 49 are `$()`/`use*$` callbacks, rest local functions, `*$` props, JSX factories, `sync$`); `SetupKind.Js` at `analyse/lower-setup.ts:592` (any setup statement that is not `const`/`let`/`var`/`function`/`use*` call: `if`, `try`, `return`, assignments, plain calls); `HookBodyKind.Js` has zero producers and `QrlBodyKind.Task` zero producers (schema-only, generators throw).
2. A fourth hole, `ExprKind.Js` (`lower-expr.ts:117,136,250`, `lower-array.ts:394`, `lower-jsx.ts:606`), fires for every expression outside `tryLowerExprIr`'s literal/identifier/member subset — 480 hits, 121 fixtures.
3. Consumers: every Js hole prints through one function, `generate/emit-chunk.ts:407 extractPayloadJs` (slice `module.source.code` by range, splice `qrls/reads.value/awaits` + for setup `renders/setups`); the linker only walks the hole table (`link/qrl-dependencies.ts`, `link-hooks.ts:218`, `render-results.ts:145`), never the text. SSR and CSR treat Js identically.
4. Payload level: `Payload` is a source *range* plus a hole table (`schema/value.ts:21-44`); `text?` is never written anywhere. Not every body is JS text — `Program`/`Expr`/`Task` arms carry no payload; conversely IR is never *beside* a Js body but *inside* it (renders/setups/qrls/reads holes). `lowerComputedExpressionValue`/`lowerInlineExpressionValue` push an orphan payload even when IR wins.
5. Fixture count (analyser re-run over 216 `*.ssr.snap` inputs): `QrlBodyKind.Js` in 74 fixtures, `SetupKind.Js` in 11, `HookBodyKind.Js` in 0, any-of-three in 78 (36 %); list in the findings file. DESIGN.md rule 5 and the Payload section are quoted there.
