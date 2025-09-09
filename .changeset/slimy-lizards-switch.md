---
'@builder.io/qwik': patch
---

FIX: preloader now preloads bundles as long as they are part of the current viewport's bundles graph, even if their probability is very small
