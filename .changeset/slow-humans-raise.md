---
'@qwik.dev/router': minor
---

FEAT: Add `routeConfig` export as a unified alternative to separate `head`, `eTag`, and `cacheKey` exports

The new `routeConfig` export groups all page-level configuration into a single export with the same resolution rules as `head` (static object or function). When a module exports `routeConfig`, separate `head`, `eTag`, and `cacheKey` exports on that module are ignored.
