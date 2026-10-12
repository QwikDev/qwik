---
'@qwik.dev/router': patch
---

fix: a route that only exports a `routeLoader$`, for example to redirect, now runs its loaders instead of returning 404
