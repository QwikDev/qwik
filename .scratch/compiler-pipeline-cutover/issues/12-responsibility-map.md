# File responsibility map for pipeline/
Type: grilling
Status: resolved
Blocked by:

## Question

Agree the target file map. Known candidates: `analyse/lower-jsx.ts` (1474) split by
element / attributes / children / component target; `generate/emit-chunk.ts` printer
(`valueIrJs`, `memberJs`, `expressionJs`, `inlineValueJs`, `bindHandlerJs`) out to its own
file; shared emission between `js-ssr.ts` (1289) and `js-csr.ts` (1264); `lower-setup.ts`
(847) const-declaration vs setup-call resolution; `link/render-results.ts` (825) local
component setups vs linking; merge `pipeline/names.ts` + `generate/names.ts`; rename the two
`type-results.ts`; `compat/transform-modules.ts` is renamed `pipeline/transform-modules.ts` per ticket 01, so decide only whether `pipeline/index.ts` still re-exports it. Decide which splits
are worth it, names, and the order (before or after cutover).

## Answer

Resolved 2026-09-17 (Varixo accepted all). Every split is a pure move gated by byte-unchanged snapshots and
plan snapshots; ordered after the cutover series and before the feature work (statement IR, ErrorBoundary,
multi-head). The pipeline README layout table becomes the responsibility map; no lint rule.

| today | after |
| --- | --- |
| `generate/js-ssr.ts`, `generate/js-csr.ts` (one `generateModule` closure each) | `generate/ssr/{element,component,collection,branch,content,events}.ts` and `generate/csr/…` over an explicit emitter context; two dispatchers; shared leaf helpers only |
| `generate/emit-chunk.ts` (24 exports) | `generate/print-js.ts` (`valueIrJs`, `memberJs`, `expressionJs`, `inlineValueJs`, `bindHandlerJs`, `extractPayloadJs`, `functionText`), `generate/qrl-chunks.ts` (`emitQrlChunks`, `syncQrlHoists`, `createQrlResolver`, chunk filename/module code), `generate/captures.ts` (capture names, preludes, bound/static references, root args); `programKind`, `rowShapeCode` beside program emission |
| `analyse/lower-jsx.ts` | `lower-element.ts`, `lower-component.ts`, `lower-children.ts`, `lower-projection.ts`, `lower-render-qrl.ts` |
| `analyse/lower-setup.ts` | `lower-setup.ts` (statements, declarations, aliases, local functions/components) + `lower-setup-call.ts` (`resolveSetupCall`, setup calls, style, visible-task event, call targets, hook args, callbacks); ticket 07's statement IR in `lower-statement.ts` |
| `link/render-results.ts` | `link/render-results/{exposed,active,mutations,evaluate,classify}.ts` over an explicit query context (recursion fix lands in `evaluate`) |
| `link/link-plans.ts` | `link/{resolve,materialize,reachability}.ts` + `linkPlans` orchestrator (ticket 18's rule lands in `reachability`) |
| `pipeline/names.ts` + `generate/names.ts` | `generate/names.ts` |
| `analyse/type-results.ts`, `link/type-results.ts` | `analyse/type-contracts.ts`, `link/type-queries.ts` |
| `pipeline/index.ts` re-export of `transformModules` | kept; it is the host entry after ticket 01's rename |

Amendment (ticket 13): `analyse/lower-hole.ts` → `analyse/lower-text.ts`.
