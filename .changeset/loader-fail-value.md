---
'@qwik.dev/router': patch
---

fix: routeLoader$ fail() now sets the loader value to { failed } instead of throwing an error, as it was before.
