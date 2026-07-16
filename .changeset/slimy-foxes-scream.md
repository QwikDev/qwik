---
'@qwik.dev/router': minor
'@qwik.dev/core': minor
---

FEAT: the Vite environment API is now better supported. This means that you can build multiple environments simultaneously without Qwik having a problem, with `vite build --app`.

However, Qwik Router adapters still require running `build.server` separately for now because they use a different vite configuration file.

The minimum supported version of Vite is now 6.0.0.
