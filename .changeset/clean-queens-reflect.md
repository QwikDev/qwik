---
'@builder.io/qwik': patch
---

in dev mode, qrl segments now start with their parent filename so it's easy to see where they came from. Furthermore, in production builds these filenames are also used so that origins in q-manifest.json are easy to understand.
