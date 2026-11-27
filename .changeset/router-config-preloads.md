---
'@qwik.dev/router': patch
---

fix: the router config preloads with the router code that needs it, saving a round trip on `nav()` and form actions
