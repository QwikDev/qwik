---
'@qwik.dev/core': patch
---

fix: surface a failed vnode-data resume — report it and unblock the `whenVNodeDataReady` waiters — instead of swallowing the error into a silent hang.
