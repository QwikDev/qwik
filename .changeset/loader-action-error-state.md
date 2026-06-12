---
'@qwik.dev/router': major
---

BREAKING: loader/action failures moved from `.value` to `.error`. Return `fail(status, data)` (or fail a validator) and read the typed `ServerError` from `loader.error` / `action.error` — `.value` is the success type only and `value.failed` is gone. `throw error()` keeps aborting to the error page.
