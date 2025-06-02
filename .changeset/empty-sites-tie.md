---
'@builder.io/qwik': patch
---

:zap: the qwikloader is no longer embedded in the SSR results. Instead, the same techniques are used as for the preloader to ensure that the qwikloader is active as soon as possible, loaded from a separate bundle. This reduces SSR page size by several kB end ensures that subsequent qwikloader loads are nearly instant.
