---
'@qwik.dev/core': patch
---

Split the optimizer bindings into the new `@qwik.dev/optimizer` package.
`@qwik.dev/core/optimizer` now re-exports the optimizer runtime from that package while keeping
the Vite plugin bundled in core.
