---
'@qwik.dev/core': patch
---

fix: the TypeScript optimizer now handles pure calls like `Math.random()` the same way as the Rust optimizer
