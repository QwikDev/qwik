---
'@qwik.dev/core': patch
---

FIX: after resuming, visible tasks only run when actually visible, not just when a task needs running. During CSR the behavior remains unchanged, they run immediately.
