---
'@qwik.dev/router': minor
---

feat: render SSG in a dedicated Vite build environment, so prerendered route code stays out of the deployed server bundle

SSG now runs from the `buildApp` step of the Vite builder. The Qwik CLI and adapters already build via `createBuilder().buildApp()`, so they need no change. Code that prerenders by calling Vite's programmatic `build()` directly must switch to `builder.buildApp()`, otherwise the SSG step is silently skipped.
