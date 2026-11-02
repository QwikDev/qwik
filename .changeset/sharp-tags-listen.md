---
'@qwik.dev/optimizer': patch
'@qwik.dev/core': patch
---

fix: the optimizer now emits `_jsxSplit` for dynamic JSX tags with `on*$` props (including shorthand `{ onClick$ }` and lowercase `onclick$`), so event listeners are registered when the tag is a string at runtime.
