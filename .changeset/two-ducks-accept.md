---
'@builder.io/qwik': minor
---

The optimizer now is more strict about removing sideffects in client-side code. No module-scoped code will on the client, only QRL segments.
