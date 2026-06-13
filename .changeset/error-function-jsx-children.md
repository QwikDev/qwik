---
'@builder.io/qwik': patch
---

Throw an error when a function is passed as a JSX child instead of silently skipping it. This restores the v1 behavior where passing `{myFn}` instead of `{myFn()}` would produce a clear error message.
