---
'@qwik.dev/core': minor
---

feat: an errored async signal keeps its stale value — `.value` returns it alongside `.error`, and throws only when no value ever settled; a resumed errored signal is settled instead of refetching on first read
