---
'@qwik.dev/router': patch
---

fix: client-side navigation to a URL that only exists through a server `rewrite()` now shows the rewritten page instead of a 404, and keeps the original URL in the address bar. Submitting an action on such a page keeps it rendered too, and navigating to a route that only redirects (no page component) now follows the redirect.
