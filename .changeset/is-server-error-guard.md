---
'@qwik.dev/router': minor
---

feat: `isServerError()` guard for narrowing errors in `catch` blocks (around `submit()` or `resolveValue()`) — structural, since `instanceof` doesn't survive client-side deserialization. `ServerError` is now also exported as a value from `@qwik.dev/router`.
