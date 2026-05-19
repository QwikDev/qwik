---
'@qwik.dev/core': major
---

BREAKING: `useTask()` and `useVisibleTask()` now await their cleanup functions before running the next invocation. If this is not what you want, do not return the cleanup `Promise` (and handle errors).
