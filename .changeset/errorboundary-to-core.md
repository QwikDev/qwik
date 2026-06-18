---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

`ErrorBoundary` now ships from `@qwik.dev/core` instead of `@qwik.dev/router` — update your imports. It also changes behavior:

- **`fallback$` is now required.**
- The `useErrorBoundary()` hook is **removed** — `<ErrorBoundary>` is the single error-boundary surface.
- It catches errors only from **its own subtree**: the **closest** boundary handles an error, instead of every boundary on the page reacting to the global `qerror` event.
- It now catches render throws during **SSR** (rendering `fallback$` in place), not just on the client.
- **Experimental** (opt-in `errorBoundary` feature, with `suspense` + out-of-order streaming): on SSR the boundary **never blocks streaming**. Its subtree streams inside a visible content host next to a hidden fallback host; if a descendant throws, `fallback$` is streamed as an out-of-order segment and an inline script (the shared Suspense `qO` executor) hides the content host and reveals the fallback — the swap happens as the error chunk is parsed, before the framework resumes, so it never waits on the client runtime. A deferred throw from a child `<Suspense>` tears the **whole** boundary down to `fallback$` (the fallback replaces the boundary, not a sub-slot of it). Size the fallback to the content box for zero CLS. A boundary placed *inside* a `<Suspense>` instead buffers within that already-deferred segment (clean skeleton → fallback).
