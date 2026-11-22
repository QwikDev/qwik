---
'@qwik.dev/core': patch
---

fix: a task reading a computed through context, a store or props could run twice while the computed's code was loading
