---
'@qwik.dev/router': patch
---

fix: `routeLoader$` signal `invalidate()` and `usePoll` now re-fetch, honoring the loader's cache headers
