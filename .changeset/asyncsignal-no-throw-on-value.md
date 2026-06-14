---
'@qwik.dev/core': minor
---

`AsyncSignal` no longer throws when reading `.value` while in an error state — it returns the stale/initial value, and the error is read via `.error` / `.untrackedError`.
