---
'@qwik.dev/core': patch
---

fix: render a constant `true` attribute (e.g. `<button disabled>`) as `disabled=""` on a client-created element, like SSR does, instead of `disabled="true"`
