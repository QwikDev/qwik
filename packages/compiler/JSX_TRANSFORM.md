# JSX Transform

`@qwik.dev/compiler` lowers qualified TSX components to the CSR and SSR runtimes. OXC is
the syntax frontend for both qualified components and ordinary modules.

## Entry flow

For every input module, `transformModules()` runs:

```text
source
  -> OXC TypeScript normalization with JSX preserved
  -> OXC parser
  -> binding and reference analysis
  -> component discovery and shape validation
  -> semantic RenderPlan and SegmentPlans
  -> CsrPlan or SsrPlan
  -> target emitter
  -> range-based module assembly
```

TypeScript normalization creates a source map only when requested. Diagnostics and emitted metadata
are mapped back to the original input coordinates.

The compiler transform returns one of three results:

- `success` returns the complete generated module graph;
- `failure` returns diagnostics and an empty input module, without a JSX fallback;
- `not-applicable` delegates a module without component candidates to the ordinary OXC transform.

## Responsibilities

- Binding analysis assigns stable IDs to declarations and references. Names alone never decide
  captures, imports, Qwik hooks, or component identity.
- Shape validation accepts the supported linear component setup and rejects unsupported control
  flow before lowering.
- Semantic lowering is the only layer that classifies JSX, ordered props, branches, slots,
  collections, dynamic content, effects, ownership, and lifetimes.
- CSR and SSR planners consume the same validated semantic plan and decide templates, ranges,
  target operations, parameter ABI, and reachable segments.
- Emitters serialize target plans. They do not inspect the AST or reclassify source expressions.
- Module assembly performs range edits, exact import linking, target-specific reachability, and
  source-map composition while preserving unrelated module code and statement order.

## Target behavior

CSR emits static templates plus fine-grained effects and structural ranges. Returned Promises keep
the synchronous fast path and commit only the latest active attempt. Manually thrown Promises are
not supported.

SSR emits recursive `SsrOutput` with structured records and typed references. Rendering is
sequential: siblings, rows, and slot projections settle in document order. A record is fully
materialized before the writer performs one ordered write.

Plain array maps render sequential collections. Proven or derived reactive sources use keyed
collections with compiler-planned keys and row markers. Target-native render functions already
return DOM nodes on CSR and `SsrOutput` on SSR; the runtime does not reinterpret arbitrary JSX
values.

Implicit `$` calls are recognized by imported binding identity. CSR calls the direct implementation
with the extracted function and captures; SSR calls the corresponding QRL implementation. An
existing `inlinedQrl()` is already a complete QRL and passes through unchanged.

## Deferred work

Styles parity, Suspense, and multi-head/out-of-order SSR are separate work. Their absence does not
introduce a second compiler pipeline. Detailed internal contracts and current implementation work
are tracked in [`PLAN.md`](./PLAN.md).
