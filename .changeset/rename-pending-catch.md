---
'@qwik.dev/core': major
'@qwik.dev/router': patch
---

feat: rename the experimental `<Suspense>` and `<ErrorBoundary>` to `<Pending>` and `<Catch>`, enabled with the `pendingBoundary` and `catchBoundary` flags. The render result's `errorBoundaryCaught` is now `hasCaughtError`.
