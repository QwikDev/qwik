---
'@qwik.dev/router': patch
---

fix(router): match backtick-wrapped static-path placeholders in adapter post-build

Rolldown can re-emit the `__QWIK_ROUTER_STATIC_PATHS_ARRAY__` / `__QWIK_ROUTER_NOT_FOUND_ARRAY__` placeholders as backtick template literals. The post-build replacement regex only matched single and double quotes, so the placeholders were left untouched and `isStaticPath` broke. The regex now also accepts backticks.
