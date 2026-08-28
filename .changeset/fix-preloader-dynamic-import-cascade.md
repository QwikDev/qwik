---
'@qwik.dev/core': patch
---

fix(preloader): don't over-preload large lazy-import maps (CMS/component registries)

A component that references a large map of lazy imports (a CMS registry, a router that can render
any of N components) preloaded every one of the N bundles on the first page that used it, even
though only one branch is ever taken. Fixed with four coordinated changes:

- **Cascade** (`queue.ts`): only static imports (`$importProbability$ === 1`) of a certain bundle
  are elevated to certain; dynamic imports keep propagating multiplicatively.
- **Fan-out-aware edge probability** (`convertManifestToBundleGraph`): a bundle's dynamic-import
  edges are damped by `min(1, FANOUT_FREE / fanOut)`, so a large selection map scores each edge far
  lower than a couple of lazy children (a modal). Low fan-out is unchanged.
- **Finer probability encoding** (bundle graph now serialised at 1/100 instead of 1/10): a damped
  registry edge keeps a distinct low probability (e.g. 0.06) instead of rounding up to 0.1 and
  compounding across a propagation chain (which otherwise pushed unused bundles over the floor on
  SPA navigation).
- **Preload floor** (`$minPreloadProbability$`, default 0.2): bundles below the floor aren't
  speculatively preloaded.

A lazy modal (and its handlers) referenced by an on-page component is still preloaded before the
interaction — verified by a regression test.
