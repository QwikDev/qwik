---
'@qwik.dev/router': minor
---

feat: error channel for loaders and actions -> `return error(status, data)` surfaces a typed `ServerError` on `loader.error` / `action.error`, and `.value` no longer throws. `return fail()` and validators now populate `.error` too (the `.value.failed` branch is deprecated). `throw error()` still aborts to the error page (404/500).
