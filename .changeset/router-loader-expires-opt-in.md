---
'@qwik.dev/router': patch
---

Loader HTTP caching is now opt-in: `routeLoader$` no longer defaults `expires` to 120 seconds, so mutations are immediately visible to client-side loader fetches. Pass `expires` explicitly to cache a loader's responses.
