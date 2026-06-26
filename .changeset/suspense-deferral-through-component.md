---
'@qwik.dev/core': patch
---

fix: show the `Suspense` fallback when a suspending child is wrapped in an intervening component (e.g. `ErrorBoundary`); the nearest cursor boundary is now found via an ancestor walk so client navigation no longer blocks on the async work.
