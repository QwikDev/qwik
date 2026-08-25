---
'@builder.io/qwik': patch
---

FIX: `useConstant()` now retains a `null` factory result instead of re-running the factory on every render. The retention guard changed from `!= null` to `!== undefined`, so any defined value (including `null`) is cached for the lifetime of the component; only a factory that returns `undefined` is re-run on each render.
