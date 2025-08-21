---
'@builder.io/qwik': patch
---

The entry.ssr renderToStream `preloader.preloadProbability` option is now deprecated because this could cause performance issues with bundles fetched on on click instead of being preloaded ahead of time.
