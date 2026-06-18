---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

`ErrorBoundary` now ships from `@qwik.dev/core` instead of `@qwik.dev/router` — update your imports. It also changes behavior:

- **`fallback$` is now required.**
- The `useErrorBoundary()` hook is **removed** — `<ErrorBoundary>` is the single error-boundary surface.
- It catches errors only from **its own subtree**: the **closest** boundary handles an error, instead of every boundary on the page reacting to the global `qerror` event.
- It now catches render throws during **SSR** (rendering `fallback$` in place), not just on the client.
- **Experimental** (opt-in `errorBoundary` feature): on SSR the boundary buffers its subtree and, if a descendant throws, rolls it back and renders `fallback$` in its place — so SSR matches the client's clean `boundary > fallback` instead of leaving the partially-streamed subtree behind. Works with in-order streaming, inside `<Suspense>`, and nested; an async throw from a child `<Suspense>` is routed to the boundary's fallback (injected into the Suspense slot) instead of aborting the render.
