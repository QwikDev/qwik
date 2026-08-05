---
'@qwik.dev/core': patch
---

fix: surface a failed container resume — report it and unblock `whenContainerDataReady` waiters — instead of swallowing the error into a silent hang.
