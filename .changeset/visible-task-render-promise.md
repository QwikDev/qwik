---
'@qwik.dev/core': patch
---

fix: keep the render promise pending until async visible tasks have run, so `waitForDrain()` and `trigger()` wait for them
