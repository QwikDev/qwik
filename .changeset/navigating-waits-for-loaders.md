---
'@qwik.dev/router': patch
---

fix: `useLocation().isNavigating` stays true until a navigation that reuses the current route component has rendered its new loader data
