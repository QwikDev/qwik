# Compiler contract for Suspense, Reveal and ErrorBoundary
Type: grilling
Status: resolved
Blocked by:

## Question

Group 13 of JSX-IMPLEMENTATION. Decide the lowering surface: which markers/props the analyser
recognizes (`<Suspense fallback>`, `<Reveal>`, `<ErrorBoundary fallback$>`,
`useErrorBoundary`), the op each becomes, how async components and thrown promises retry
without duplicate initialization or projection, fallback QRL delivery, nested boundaries and
preservation of previous content, which runtime ABI exists (`createSuspense`,
`createSsrSuspense`, range `<!d=`) and which is missing. Reveal was "deliberately excluded" in
MULTI_HEAD_SSR.md; Varixo reopened it (Q12). Output: op table + runtime gap list + the spec
files from main to port.

## Answer

Resolved 2026-09-17 (Varixo accepted; research 10 supplied the inventory).

- **Suspense**: recognized by binding identity like `Slot`; marker erased; children → content `Program`,
  `fallback$` → an ordinary render QRL, `delay` → `Value`, into the existing `OpKind.Suspense`; emitters call
  `createSuspense` / `createSsrSuspense` as legacy did. No Suspense-specific QRL role, no host element.
- **Reveal**: lexical indices. One `createRevealGroup(order, collapsed, count)` per `<Reveal>` in the enclosing
  render, each child Suspense gets `{group, index, count}` in the op's `reveal` field. A Suspense inside a
  collection row under a Reveal is diagnosed (`reveal-dynamic-count`); no runtime registry.
- **ErrorBoundary**: the second instance of the same mechanism. `OpKind.ErrorBoundary { content, fallback,
  onError, lifetime }`; runtime `createErrorBoundary` (CSR: a content range with an owner) and
  `createSsrErrorBoundary` (SSR: a child lane; failure discards the lane and renders the fallback in place,
  or delivers the fallback packet when already deferred). Errors route to the nearest boundary through the
  owner chain content blocks already keep. No VNode context lookup, no new subscriber kind.
- **Contract**: main's, unchanged: `fallback$(error, reset)`, `onError$(error, info)`, digest in prod.
  Caught: render, task, computed, event-handler (`qerror`) and visible-task throws in the subtree; a
  throwing fallback escalates to the outer boundary; non-recoverable build errors are not caught. No
  `useErrorBoundary` hook. Dropped from main's corpus: "multiple containers on one document", "SSRStream".
- **Reset**: re-creates the content as a fresh one-shot instance (new owner, tasks re-run), a remount.
- **Async components / thrown promises**: no compiler item. Runtime retry stays; the lean-Suspense text is
  corrected to "supported by retry, not by contract". Proof: port `render-promise.spec.tsx` and the async
  cases of `render-api.spec.tsx`.
- **Corpus**: port `suspense.spec.tsx` (47, Reveal inside) and `error-boundary.spec.tsx` (122 minus the drops)
  as behavior specs in csr/resume/ssr, VDOM-structure assertions adapted; `suspense.e2e.ts` and
  `streaming.e2e.ts` are the browser gate.
