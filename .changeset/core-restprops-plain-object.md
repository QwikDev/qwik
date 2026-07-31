---
'@qwik.dev/core': patch
---

`_restProps` now handles plain objects: rest destructuring compiled to it no longer returns an empty object, fixing silent data loss in route loaders and other non-props contexts.
