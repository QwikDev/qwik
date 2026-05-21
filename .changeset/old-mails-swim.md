---
'@builder.io/qwik-city': minor
---

FIX: The server plugins were not actually sorted and were relying on directory traversal order. Now they are explicitly sorted by ascending name.
