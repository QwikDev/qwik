---
'@qwik.dev/router': patch
---

fix: a loader's fetch runs only the middleware of its own folder and the folders above it, in dev and non-strict mode too
