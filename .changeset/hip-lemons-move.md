---
'@builder.io/qwik': patch
---

Deprecated event$, it will be removed in v2. Instead, use `$()`, and inside the function add `if (isServer) { return; }`
