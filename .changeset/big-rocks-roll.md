---
'@qwik.dev/core': minor
---

FEAT: The optimizer now hoists QRLs without captures to the module scope. This means that only one instance of the QRL will be created.
