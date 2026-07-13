---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

feat: `<ErrorBoundary>` moves to `@qwik.dev/core` behind the experimental `errorBoundary` flag and `useErrorBoundary()` is removed. `fallback$` receives `(error, reset)`, `onError$` reports each caught error, and production errors are redacted to a generic message + digest.
