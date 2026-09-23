---
'@qwik.dev/core': minor
'@qwik.dev/router': patch
---

feat: `renderToStream` reports a pre-flush `<ErrorBoundary>` catch via `onBeforeFirstFlush`; the router sends `Cache-Control: no-store` for those pages and for error documents.
