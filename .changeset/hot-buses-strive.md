---
'@builder.io/qwik': patch
---

FIX: Rollup's hoistTranstiveImports is now set to false. The bundle-graph static imports graph is now correct; which means no more over-preloading in some edge-cases.
