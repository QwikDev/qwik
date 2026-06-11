---
'@qwik.dev/router': major
---

BREAKING: loader/action failures moved from `.value` to `.error`. A returned `fail(status, data)` (or a failed validator) now surfaces as a typed `ServerError` on the reactive `loader.error` / `action.error` — `.status` is the HTTP status, `.data` the canonical payload, and the payload fields are also exposed flat (e.g. `error.fieldErrors`). `.value` is the success type only and `value.failed` is gone; `.value` and `.error` are never both set. The producer side is unchanged: keep returning `fail()`. `throw error(status, data)` keeps its v1 meaning and aborts to the nearest error page — loaders that threw `error()` to render error pages keep that behavior; only `fail()` consumers must switch from `value.failed` checks to `.error`. Use the new `isServerError()` guard to narrow `loader.error` on the client (a plain `Error` there means the fetch itself failed).
