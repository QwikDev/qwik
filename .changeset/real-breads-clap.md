---
'@qwik.dev/optimizer': patch
---

Fix optimizer miscompiling `component$` bodies that destructure props and reassign one of the destructured names (now also handles `for-of` / `for-in` heads); previously caused dev-SSR hangs and runtime ReferenceErrors. Fixes #8638.
