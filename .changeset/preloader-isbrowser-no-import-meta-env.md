---
'@qwik.dev/core': patch
---

fix(preloader): drop `import.meta.env.TEST` shim from preloader

The preloader's `isBrowser` check used `import.meta.env.TEST` to bridge between the build-time constant and the test environment. That broke consumer projects running in plain Node where `import.meta.env` is undefined. The preloader now uses `isBrowser` from `@qwik.dev/core/build` directly; the unit tests run under happy-dom so the constant is shipped as `true` for them.
