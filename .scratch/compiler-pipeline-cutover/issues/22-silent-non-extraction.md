# Silent non-extraction: `component$` in plain functions and `jsx()` factory calls
Type: grilling
Status: resolved
Blocked by:

## Question

Research 03 and 16: `component$(...)` inside a plain function (`factory/utils.tsx`), runtime
`jsx()`/`jsxDEV()` calls (`slot.tsx`, 7 layerA inputs) and `native$` pass through untransformed with
zero diagnostics. The standing rule is fail closed. Decide per shape: diagnose (`unsupported-runtime-jsx`
already exists for JSX outside a candidate; extend to `jsx()` calls and nested `component$`), or
support (a `component$` in a factory is group 4's "components returned by factories", solved by
location-independent `$` extraction). Decide which shapes are worth supporting before cutover and
which get the diagnostic, and what the cutover sweep's zero-reject bar means for the affected e2e files.

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Factory components**: supported. `component$` anywhere in a payload becomes a component QRL value through
  the payload scan that already extracts `$()` anywhere; the body lowers as a component body and may capture
  the enclosing function's parameters (component references serialize as values). Closes group 4's
  "components returned by factories".
- **Runtime `jsx()` / `jsxDEV()` calls**: diagnosed (`runtime-jsx-call`), fail closed. The one e2e component using
  it (`slot.tsx` `RouteActionResultNavigationIssue3727`) is rewritten to authored JSX; the fixture edit is
  presented for approval at implementation time.
- **Silent rollback**: an analyser invariant test fails when a candidate rollback pushes no diagnostic (on top
  of ticket 18's rule). The two `suspense.tsx` components then surface their cause, removed by ticket 08.
- **`$` callee with a QRL argument**: the twin rule applies uniformly (`event$(fn)` → `eventQrl(qrl)`); `sync$`
  stays a compile-time marker; one snapshot per marker. `useResource$` gets no work (out of scope).
- **Cutover series**: the Suspense half of ticket 08 (a port) lands before the `plugin.ts` flip so the 16
  suspense e2e tests stay green; ErrorBoundary and lanes stay after.
