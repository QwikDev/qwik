---
'@qwik.dev/core': major
---

BREAKING: the `.promise()` method on `useAsync$` now returns a `Promise<void>` instead of `Promise<T>`, to avoid having to put `.catch()` on every call and to promote using the reactive `result.value` and `result.error` properties for handling async results and errors.
- BREAKING: the default serialization strategy for `useAsync$` is now 'always' instead of 'never', because it is likely to be expensive to get. For similar reasons, the default serialization strategy for `useComputed$` is now 'never' instead of 'always'.
