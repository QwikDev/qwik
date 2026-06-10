---
'@qwik.dev/router': patch
---

`rewrite()` now accepts same-origin absolute URLs by normalizing them to a path (so they behave like a relative rewrite) instead of throwing a 400. Cross-origin URLs are still rejected.
