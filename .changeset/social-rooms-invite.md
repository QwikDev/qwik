---
'@qwik.dev/core': major
---

BREAKING (beta only): the `interval` option of `useAsync$` has been renamed to `expires`, and a new `poll` option has been added to control whether the async function should be automatically re-run when it expires. 
