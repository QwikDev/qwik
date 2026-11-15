---
'@qwik.dev/core': patch
---

fix: the TS optimizer no longer hoists store reads that call an import into `_fnSignal`
