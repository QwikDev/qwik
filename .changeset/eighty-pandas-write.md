---
'@qwik.dev/core': minor
---

FEAT: the optimizer can now detect empty QRL segments and replace them with a more efficient noopQrl. This means that for example, you can put code meant only for the server inside `if (isServer)` blocks and they will not cause an empty QRL to be downloaded. `event$()` is therefore no longer needed.
