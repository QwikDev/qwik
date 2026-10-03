---
'@qwik.dev/core': patch
---

fix: the TypeScript optimizer no longer breaks on destructured props used as JSX tags, like `<Model />` with a default or `<ui.Home />`
