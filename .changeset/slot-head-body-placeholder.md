---
'@qwik.dev/core': patch
---

fix(core): SSR no longer crashes with `Code(Q12): SsrError(tag)` when `<head>`/`<body>` are projected through a headless component (e.g. a Provider that renders only `<Slot/>`).