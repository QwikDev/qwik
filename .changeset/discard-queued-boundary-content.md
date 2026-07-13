---
'@qwik.dev/core': patch
---

fix: ssr discards queued ErrorBoundary content after a catch; a pending sibling no longer blocks the response or the fallback
