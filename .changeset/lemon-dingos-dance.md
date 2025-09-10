---
'@qwik.dev/core': minor
---

BREAKING: (slightly) Qwik will no longer scan all modules at build start to detect Qwik modules (which should be bundled into your server code). Instead, a much faster build-time check is done, and Qwik will tell you if you need to update your `ssr.noExternal` settings in your Vite config.
