---
'@qwik.dev/router': patch
---

fix: client navigation to a URL that only exists through a server `rewrite()` now renders the rewrite target instead of the 404 page. When no page matches on the client, the router asks the server (`q-route.json`) where the URL routes to and loads that route, keeping the original URL.
