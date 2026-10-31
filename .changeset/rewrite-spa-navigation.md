---
'@qwik.dev/router': patch
---

fix: client navigation to a URL that only exists through a server `rewrite()` now renders the rewrite target instead of the 404 page. When no page matches on the client, the router asks the server (`q-route.json`) where the URL routes to and loads that route, keeping the original URL. This also follows a redirect thrown by a route that has no component. Submitting an action on such a URL resolves the rewrite too, so the page no longer turns into the 404 after the action runs.
