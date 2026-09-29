---
'@qwik.dev/core': patch
---

fix: the minified build now emits valid `@__PURE__` annotations so downstream bundlers can tree-shake it
