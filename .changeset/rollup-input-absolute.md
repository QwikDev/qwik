---
'@qwik.dev/core': patch
---

fix(vite): resolve relative SSR/client input paths to absolute before passing to rollup

When a relative path was provided via `build.ssr` (string), `qwikVite({ ssr.input })`, or `qwikVite({ client.input })`, the raw relative string was forwarded to `rollupOptions.input`. Rollup then tried to resolve it from the current working directory rather than the Vite root, which caused `Could not resolve entry module` failures in monorepo / nx setups where CWD differs from the Vite root.

Relative inputs are now normalized against the Vite root in `normalizeOptions`, matching how `rootDir`, `srcDir`, and `outDir` are handled.
