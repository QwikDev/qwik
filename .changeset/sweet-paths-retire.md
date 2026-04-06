---
'@qwik.dev/core': major
---

We removed the following `renderToStream` APIs:
- `preloads.ssrPreloadProbability` and `preloads.preloadProbability` APIs because the number of simultaneous idle preloads should be easy to determine for the developer.
- `preloads.debug` API because it hasn't really proved useful after a full year of modulepreloads.
- the deprecated Service Worker `prefetchStrategy` API.