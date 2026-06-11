---
'@qwik.dev/router': patch
---

`rewrite()` now accepts same-origin absolute URLs by normalizing them to a path (so they behave like a relative rewrite) instead of throwing a 400. An explicit query on the rewrite target replaces the request's query, otherwise the original query is kept, and fragments are dropped. Cross-origin and invalid URLs are still rejected with a 400.
