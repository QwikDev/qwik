---
'@builder.io/qwik': patch
---

FIX: We are temporarily patching an issue in Rollup which was merging statically imported modules with the QRL bundles, leading to an incorrect graph and over-preloading. We will remove the patch when the issue is resolved on the Rollup side.
