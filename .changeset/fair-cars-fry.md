---
'@builder.io/qwik': minor
---

PERF: Prefetching now happens dynamically without service worker if the prefetchImplementation is set to "html-append" (default).
PERF: Initial prefetching now includes dynamic imports, which improves initial click delay.
