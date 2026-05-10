---
'@qwik.dev/router': patch
---

fix(router): Node SSR no longer hangs when using `compression` (or other middleware that wraps `res.write` / `res.end`).
