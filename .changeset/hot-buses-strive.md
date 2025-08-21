---
'@builder.io/qwik': patch
---

FIX: Rollup's hoistTranstiveImports is now set to `false` because the hoisting added unnecessary bundles to be preloaded to the bundle-graph static imports graph. This could lead to a suboptimal preloading experience.