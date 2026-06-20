---
'@qwik.dev/router': patch
---

A thrown `error()` (or unexpected server error) during an SPA submission was silently swallowed: the action resolved as an empty success and `isNavigating` could stick. `submit()`/`run()` now rejects with the error, navigation state resets, and a non-JSON action response (e.g. a proxy error page) settles instead of hanging forever.
