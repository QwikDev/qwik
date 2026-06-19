---
'@qwik.dev/router': patch
---

fix(router): honor the `routeLoader$` `id` option so loaders created through a shared wrapper get distinct ids

When several `routeLoader$`s are defined through a shared helper that passes an inline QRL (e.g. a `withErrorHandling(fn)` wrapper), the optimizer gives that inline QRL a single hash for every instance. The loader id was derived solely from that hash, so all wrapped loaders collided on the same `__id` and all but the first were silently deduped away in `getModuleRouteLoaders` — only one loader ran on SSR and SPA navigation. The previously-deprecated `id` option is now honored again (`loader.__id = id ?? loaderQrl.getHash()`), letting each loader pass a distinct id such as `fn.getHash()`. A dev-mode warning is also logged when two distinct loaders share the same id.
