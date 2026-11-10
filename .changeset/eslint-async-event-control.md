---
'eslint-plugin-qwik': patch
---

fix: `qwik/no-async-prevent-default` now also reports `stopPropagation()` / `stopImmediatePropagation()`, inline `on*$={(e) => ...}` handlers and handlers inside a ternary or a handler array. A native listener created inside a `$` handler is no longer reported.
