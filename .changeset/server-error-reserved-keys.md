---
'@qwik.dev/router': patch
---

`ServerError` no longer flattens reserved payload keys (`message`, `status`, `data`, ...) onto the error — `error.message` is always a string and payloads can't clobber `Error` internals.
