---
'@qwik.dev/router': patch
---

fix: `redirect()` now strips ASCII tab/LF/CR from the URL, so targets like `/<TAB>/example.com` can no longer redirect to another origin
