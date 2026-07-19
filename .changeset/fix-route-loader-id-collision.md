---
'@qwik.dev/router': patch
---

fix(router): honor the `routeLoader$` `id` option so loaders created through a shared wrapper (which share one optimizer-assigned QRL hash) get distinct ids instead of all but the first being silently deduped in `getModuleRouteLoaders`. A dev-mode warning is now logged when two distinct loaders share an id.
