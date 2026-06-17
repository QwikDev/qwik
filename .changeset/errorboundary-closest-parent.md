---
'@qwik.dev/core': minor
'@qwik.dev/router': major
---

`<ErrorBoundary>` now catches errors only from its own subtree: the **closest** boundary handles an error, instead of every boundary on the page reacting to the global `qerror` event. The container routes both synchronous render throws and async errors (`qerror`) to the nearest `<ErrorBoundary>` via `handleError`. `<ErrorBoundary>` also catches render throws during **SSR** now (rendering its `fallback$` in place instead of aborting to the error page). A single top-level boundary still catches everything; nested boundaries now scope correctly.
