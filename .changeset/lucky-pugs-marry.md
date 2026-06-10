---
'@qwik.dev/router': minor
---

FEAT: When `routeConfig` provides a `cacheKey` but no `eTag`, SSR will determine an ETag value by hashing the rendered output. When the cache entry is later retrieved, the ETag is provided to the client and later requests can use the ETag for conditional requests.
