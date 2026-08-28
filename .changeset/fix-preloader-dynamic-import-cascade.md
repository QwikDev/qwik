---
'@qwik.dev/core': patch
---

fix(preloader): don't force-preload every dynamic import of a certain bundle

When a bundle reaches ~100% probability, the preloader elevated **all** of its
dependencies — static *and* dynamic — to ~99% and preloaded them, bypassing the
`maxIdlePreloads` throttle. Static imports are genuinely certain to load with
their importer, but dynamic imports are a runtime choice. As a result, a certain
bundle that merely references a large map of lazy imports (e.g. a CMS/router
component that can render any of N components) would preload all N bundles even
though only one branch is ever taken.

Dynamic imports now keep propagating multiplicatively (parentProbability ×
edgeProbability); only static imports are elevated to certain.
