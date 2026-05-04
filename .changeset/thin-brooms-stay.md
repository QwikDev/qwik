---
'@qwik.dev/core': patch
---

fix: import.meta.env.TEST is now reserved for local and CI builds, not leaking into released core.mjs anymore — preventing issues in non Vite environments.
