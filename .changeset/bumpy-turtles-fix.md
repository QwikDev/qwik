---
'@qwik.dev/core': minor
---

FEAT: Signals now expose `.untrackedValue`, which allows you to read the value without subscribing, and `.trigger()`, which allows you to trigger running subscribers, for example when you changed `.untrackedValue` earlier, or the value mutated but remained the same object.
