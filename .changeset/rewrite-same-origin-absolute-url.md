---
'@qwik.dev/router': patch
---

`rewrite()` now accepts same-origin absolute URLs by normalizing them to a path, and handles query strings (an explicit query on the target replaces the request's query; fragments are dropped). Cross-origin and invalid URLs are still rejected with a 400.
