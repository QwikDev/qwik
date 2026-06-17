---
'@qwik.dev/core': minor
'@qwik.dev/router': major
---

`<ErrorBoundary>` now catches errors only from its own subtree: the **closest** boundary handles an error, instead of every boundary on the page reacting to the global `qerror` event. The container now routes both synchronous render throws and async errors (`qerror`) to the nearest `<ErrorBoundary>` via `handleError`. A single top-level boundary still catches everything; nested boundaries now scope correctly.
