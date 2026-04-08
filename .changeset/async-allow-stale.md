---
'@qwik.dev/core': patch
---

Add `allowStale` option to AsyncSignal and routeLoader$. When `false`, invalidation clears the
previous value so reads suspend instead of returning stale data.
