---
'@qwik.dev/router': patch
---

fix: the router config no longer evaluates app route and server$ modules during the runtime's own import phase, eliminating module-order TDZ errors in bundled SSR output and making the middleware importable outside an app build
