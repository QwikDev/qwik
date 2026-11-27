---
'@qwik.dev/core': patch
'@qwik.dev/router': patch
---

perf: the router loads as one chunk with the page, so a navigation or a form action no longer waits for it
