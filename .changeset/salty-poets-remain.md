---
'@qwik.dev/core': patch
---

FIX: When a component$ wasn't loaded yet, it would use stale props by the time it resolved and executed.
