---
'@qwik.dev/router': major
'@qwik.dev/qwik-vite': major
'@qwik.dev/core': major
---

refactor: rebuild zod$ and valibot$ on Standard Schema. valibot is now stable (the `valibot` experimental flag is removed) and the vendor-specific validator types collapse into a single `SchemaDataValidator`. zod is only pulled into the bundle when `zod$` is used; it tree-shakes out otherwise. A whole-field array-type mismatch now keys `fieldErrors` by the field name (e.g. `person`) instead of `person[]`.
