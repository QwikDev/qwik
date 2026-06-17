---
'@qwik.dev/router': minor
---

feat(router): automatically omit fully-prerendered, server-free routes from the production SSR route plan so their chunks tree-shake out of size-capped server bundles.
