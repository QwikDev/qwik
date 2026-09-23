---
'@qwik.dev/router': patch
---

`zod$` now detects schemas via `z.ZodType` instead of the zod-3-only `z.Schema` alias, fixing a server-side TypeError (and 500s on every zod$ action) when the router resolves zod 4 in hoisted installs.
