---
'@qwik.dev/router': patch
---

fix: hot-reload CSS imported by route files in dev. Such CSS is resolved by Qwik and injected as a `<link>`, so Vite never watched it and edits required a server restart. The router now watches these files and emits a `css-update` so the stylesheet swaps in place.
