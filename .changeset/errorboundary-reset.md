---
'@qwik.dev/core': minor
---

feat(qwik): add `reset` to the experimental `ErrorBoundary` fallback — `fallback$` now receives `(error, reset)`; calling `reset()` clears the error and re-attempts the children. Works for both client-caught and SSR render errors (in-order and out-of-order streaming).
