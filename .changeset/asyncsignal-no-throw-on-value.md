---
'@qwik.dev/core': minor
---

`AsyncSignal` no longer throws when reading `.value` in an error state — it returns `undefined` (or the resolved value / `fail()` union); the error is read via `.error`. If an errored signal's `.error` is never read, a warning is logged — dev only by default, configurable via the `qwikVite` `unhandledErrorWarning` option (`'dev'` / `'all'` / `'off'`) or `globalThis.qWarnUnhandledErrors`.
