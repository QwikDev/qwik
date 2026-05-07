---
'@qwik.dev/core': patch
---

fix: make `import.meta.env.X` accesses null-safe (`import.meta.env?.X`) so non-Vite consumers (webpack, etc.) don't blow up at runtime when `import.meta.env` is undefined.
