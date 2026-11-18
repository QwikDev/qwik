---
'@qwik.dev/core': patch
'@qwik.dev/router': patch
---

perf: speculative preloads go out by kind (handlers, then other QRLs, then components), and every chunk a page can reach is preloaded
