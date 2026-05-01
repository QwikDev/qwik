---
'@qwik.dev/core': patch
---

fix(core): hide `node:async_hooks` import from non-Qwik bundlers

`use-locale.ts` does `import('node:async_hooks')` inside an `if (isServer)` branch to set up `AsyncLocalStorage`. Consumers that bundle `@qwik.dev/core` for the browser without the Qwik Vite plugin (e.g. Cypress's webpack-preprocessor) can't tree-shake the dead branch and fail at build time with `UnhandledSchemeError: Reading from "node:async_hooks" is not handled`. The dynamic-import target is now built at runtime so the literal isn't preserved through Rollup's constant folding, and `/* webpackIgnore */` / `/* @vite-ignore */` comments cover consumer bundlers.
