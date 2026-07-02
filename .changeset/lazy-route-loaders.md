---
'@qwik.dev/router': major
---

FEAT: route loaders now do not block SSR start, and they can no longer redirect or error the response. Instead, use request handlers like `onGet`. Consider each route loader as a separate request that does not impact the page.
