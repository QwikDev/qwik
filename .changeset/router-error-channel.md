---
'@qwik.dev/router': minor
---

feat: error channel for loaders and actions -> `return error(status, data)` now surfaces a typed `ServerError` on `loader.error` / `action.error`. `return fail()` and the `.value.failed` branch are deprecated. `throw error()` still aborts to the error page (404/500).
