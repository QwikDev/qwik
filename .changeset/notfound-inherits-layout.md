---
'@qwik.dev/router': major
---

BREAKING: 404.tsx and error.tsx now render inside their layouts (with `@layout`/`!` modifiers), a route miss resolves the nearest 404.tsx, and the 404 page is prerendered for static hosts. Rename `404.tsx` to `404!.tsx` if you do not want to add the layout.
