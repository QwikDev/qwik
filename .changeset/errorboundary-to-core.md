---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

`ErrorBoundary` now ships from `@qwik.dev/core` instead of `@qwik.dev/router` — update your imports. It also changes behavior:

- `fallback$` is now required.
- New optional `onError$` side-effect (logging/telemetry), fired once per caught error.
- The `useErrorBoundary()` hook is removed — `<ErrorBoundary>` is the single error-boundary surface.
- An error is handled by the closest boundary (its own subtree), instead of every boundary reacting to the global `qerror` event.
- Render throws are now caught during SSR, not just on the client.
- `<ErrorBoundary>` requires enabling the experimental `errorBoundary` feature (`qwikVite({ experimental: ['errorBoundary'] })`); rendering one without it throws. With the flag, a descendant throw swaps the content for `fallback$` via an inline script. Also enabling `suspense` + `streaming.outOfOrder` streams the fallback out-of-order so the boundary never blocks streaming.
