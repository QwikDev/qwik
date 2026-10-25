---
'@qwik.dev/router': patch
---

fix: a 404, 405, 410 or 501 `HttpError` keeps the route's cache policy, and other errors are never cached.
