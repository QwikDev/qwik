---
'@qwik.dev/core': minor
---

FEAT: Signals now expose `.untrackedValue`, which allows you to read the value without subscribing, and `.force()`, which allows you to force running subscribers, for example when the value mutated but remained the same object.
