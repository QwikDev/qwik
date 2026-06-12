---
'@qwik.dev/router': patch
---

Loader error and redirect envelopes are no longer sent with a `Cache-Control: max-age` header — only successful data envelopes are cacheable.
