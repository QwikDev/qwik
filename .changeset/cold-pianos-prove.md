---
'@qwik.dev/router': patch
---

FIX: Some smaller fixes to the router:

- prevent crashing due to container missing during navigation
- don't append `/` to paths that are not known
- remove `qwikRouterConfig` from router creation, it's entirely internally managed
