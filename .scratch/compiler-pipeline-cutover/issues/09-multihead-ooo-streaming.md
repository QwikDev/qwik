# Multi-head SSR and out-of-order streaming for Suspense
Type: grilling
Status: resolved
Blocked by:

## Question

MULTI_HEAD_SSR.md marks generic multi-head as deferred; Varixo puts it in scope (Q12). Decide
what "multi-head" means for this map (request lanes / `maybeFork()` / ordered commit as
sketched, or only what out-of-order Suspense needs), the state-sharing contract across
segments (`$serializeNext$`, `q:sub` append-only), late-arriving segment resume, cancellation
of stale results, and which of the sketch's "decisions to reopen" are decided now. Output: the
scope line plus the compiler/runtime split.

## Answer

Resolved 2026-09-17 (Varixo chose generic multi-head; research 20 supplied the facts).

- **Scope**: multi-head means promises across components resolve in parallel and output commits in document
  order, for SSR latency. Out-of-order Suspense streaming already exists; this ticket adds parallelism for
  every other async boundary.
- **Heads**: every place a render can suspend: a component whose setup awaits (initial task work), a
  component returning a promise, a promise child, a projection, a collection row once async rows land.
  Siblings start in source order without waiting on each other; a child behind an ancestor's `await`
  starts when the continuation reaches it. The emitter wraps each such boundary; the runtime forks a lane
  only when the result is actually a promise. Root cause fixed: today every task drains on the single root
  lane one at a time (two 50 ms siblings = 100 ms); a lane per head is the concurrency change.
- **Isolation** (no `SsrCommit`, no remap table): (1) head ids assigned synchronously at creation in source
  order; (2) counters that must be strings during render (`q:id`, `useId`) are head-local and head-prefixed
  (`<head>.<n>`); (3) everything that only needs a number at write time (serialization roots, event-attr
  root references, style dedupe, sync-function indices) becomes a typed reference chunk the writer numbers
  in document order when it materializes (the role `SsrReferenceChunk` was designed for). Patches stay
  lane-local and flush in commit order. Gate: permuting promise resolution yields byte-identical HTML and
  state (research 20's async-computed case is the first regression test).
- **Shell mode**: keep the explicit runtime behavior: the in-order prefix up to the first deferred range is
  one flush; later state, subscriptions and sync functions ride in packets. Documented, no buffering mode.
- **In-order propagation**: `blocking` derived from the analyser's DOM-nesting table; the runtime awaits
  inline there; a dev-time diagnostic `suspense-in-order` names the element that forced it (warning).
- **Late segments, cancellation, shared state**: no new design; gate = the 20 existing e2e tests on the
  pipeline compiler plus main's out-of-order describes ported per ticket 08.
- **Failure**: fail-fast without a boundary (stop writes, dispose uncommitted owners, reject, no synthesized
  markup); with an ErrorBoundary above, discard the lane and commit the fallback (ticket 08).
- **Limits**: none in the first version. The sketch's typed-`sync$`-ref and sync-`maybeFork` questions are
  answered by rules (1)–(3).

Amendment (ticket 13): the canonical term for a head is **lane**; read every "head" above as lane.
