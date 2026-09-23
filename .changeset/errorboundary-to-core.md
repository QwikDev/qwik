---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

feat: `<ErrorBoundary>` moves to `@qwik.dev/core` behind the experimental `errorBoundary` flag and `useErrorBoundary()` is removed. `fallback$` receives `(error, reset)`, `onError$` reports caught errors, and production redacts server-origin errors to a generic message + digest while client-origin errors render as thrown.
