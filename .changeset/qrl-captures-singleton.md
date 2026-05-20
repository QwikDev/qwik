---
'@qwik.dev/core': patch
---

fix: QRL captures live in a shared `_capturesObj` singleton so duplicated core copies see them; `_captures` stays exported for already-built libraries
