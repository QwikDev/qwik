---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

`ErrorBoundary` now ships from `@qwik.dev/core` instead of `@qwik.dev/router` — update your imports. It also changes behavior:

- **`fallback$` is now required.**
- It catches errors only from **its own subtree**: the **closest** boundary handles an error, instead of every boundary on the page reacting to the global `qerror` event.
- It now catches render throws during **SSR** (rendering `fallback$` in place), not just on the client.
