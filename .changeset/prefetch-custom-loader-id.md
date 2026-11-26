---
'@qwik.dev/router': patch
---

fix: link prefetch requests each route loader at the url its navigation fetches: a custom-id loader by its id, a link without its trailing slash at the navigation's path, a loader the route imports and then re-exports (`export { useData }`), and never a loader dropped for a duplicate id
