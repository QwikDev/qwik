---
'@qwik.dev/router': minor
---

feat: error channel for loaders and actions. `return error(status, data)` now surfaces a typed `ServerError` on `loader.error` / `action.error` (for `zod$`/`valibot$`/`validator$` it carries `ValidatorErrorType`). `return fail()` and the `.value.failed` branch are deprecated but keep working. `throw error()` still aborts to the error page (404/500). Validator failures populate both channels for back-compat.
