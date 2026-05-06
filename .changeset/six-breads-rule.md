---
'@qwik.dev/core': major
---

BREAKING: When using the `base` setting in Vite, the client build will no longer be placed under that base path. Instead, the output directory is always `dist/` by default. If you need to change the output directory, use the `build.outDir` setting in Vite or the `outDir` option in the `qwikVite` plugin under `client` or `ssr`.
