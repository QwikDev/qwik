---
'@qwik.dev/router': minor
---

feat: add `schema$`, a validator that accepts any Standard Schema library (zod, valibot, arktype, effect, …). `zod$`, `valibot$`, and the re-exported `z` are deprecated in favor of it; all still work, and `z` tree-shakes out when unused.
