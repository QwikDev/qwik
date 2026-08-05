---
'@qwik.dev/router': minor
---

FEAT: Routeloaders now support a `cacheKey` and `eTag` property, similar to SSR `pageConfig`. The only difference is that the full value is known before sending, so cached entries generate an ETag before returning the initial request instead of after rendering as with SSR.
