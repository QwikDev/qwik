---
'@qwik.dev/core': patch
---

fix: inline components projected into a slot now resolve context from the component they are projected into, fixing the MDX provider pattern (`useMDXComponents`).
