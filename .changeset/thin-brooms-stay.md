---
'@qwik.dev/core': patch
---

fix: non-Vite consumers (webpack, etc.) don't blow up at runtime anymore when `import.meta.env` is undefined.
