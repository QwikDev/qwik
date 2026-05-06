---
'@qwik.dev/router': minor
---

FEAT: route loaders now accept `search` to only allow certain query parameters to trigger the loader. This means that random search parameters won't cause the loader to re-run. If you do not pass `search`, then all search parameters will be passed to the loader and will trigger it when they change.
