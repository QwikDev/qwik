---
'@qwik.dev/router': patch
---

fix: reject `server$` calls that get an HTML page or another non-server$ response instead of resolving `undefined`
