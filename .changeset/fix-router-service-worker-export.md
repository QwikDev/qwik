---
'@qwik.dev/router': patch
---

fix: drop the `./service-worker` export — it pointed at a file the package doesn't ship, and `setupServiceWorker` is a no-op in v2 anyway
