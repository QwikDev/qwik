---
'@qwik.dev/optimizer': patch
'@qwik.dev/core': patch
---

fix: the optimizer now emits `_jsxSplit` for dynamic JSX tags with `on*$` props (including shorthand `{ onClick$ }`, lowercase `onclick$` and computed keys, where `['onClick$']` is handled like `onClick$`), so event listeners are registered when the tag is a string at runtime. `passive:*` directives on such tags are kept too.
