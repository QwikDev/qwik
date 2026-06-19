---
'@qwik.dev/core': minor
---

`AsyncSignal` no longer throws when reading `.value` in an error state — it returns `undefined` (or the resolved value / `fail()` union); the error is read via `.error`. If an errored signal's `.error` is never read, a dev-only warning is logged (enable in production with `globalThis.qWarnUnhandledErrors = true`).
