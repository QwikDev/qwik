---
'@qwik.dev/router': minor
---

feat: a plain `throw new Error` in a loader settles the loader's `.error` instead of failing the response; `error()`/`ServerError` and redirects still abort, and loader error envelopes are never HTTP-cached
