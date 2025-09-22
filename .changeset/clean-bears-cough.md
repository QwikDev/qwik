---
'@builder.io/qwik': minor
---

FIX: Qwik now leverages Rollup's new `output.onlyExplicitManualChunks` feature. For the latest and greatest, we recommend to install rollup@^4.52.0 directly in your project. It enables the new Rollup `outputOpts.onlyExplicitManualChunks` feature flag, which improves preloading performance and reduces cache invalidation for a snappier user experience.
