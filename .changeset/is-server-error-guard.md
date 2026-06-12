---
'@qwik.dev/router': minor
---

feat: new `isServerError()` guard for narrowing errors in `catch` blocks (around `submit()` or `resolveValue()`), since `instanceof ServerError` doesn't survive client-side deserialization.
