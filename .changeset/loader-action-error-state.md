---
'@qwik.dev/router': major
---

BREAKING: route loaders and actions now report failures via `loader.error` / `action.error` instead of `fail()` / `value.failed`. `throw error(status, data)` and failed validators surface on `.error` consistently on the server and the client, and `.value` is the success type only.