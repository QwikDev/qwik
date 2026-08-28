---
'@qwik.dev/core': patch
---

fix(preloader): don't over-preload large lazy-import maps (CMS/component registries)

When a bundle became certain to run, the preloader elevated **all** of its
dependencies — static and dynamic — to ~99% and preloaded them. A component that
references a large map of lazy imports (a CMS registry, a router that can render
any of N components) therefore preloaded every one of the N bundles on the first
page that used it, even though only one branch is ever taken.

Fixed with three coordinated changes:

- **Cascade** (`queue.ts`): only static imports (`$importProbability$ === 1`) of a
  certain bundle are elevated to certain; dynamic imports keep propagating
  multiplicatively (parentProbability × edgeProbability).
- **Fan-out-aware edge probability** (`convertManifestToBundleGraph`): a bundle's
  dynamic-import edges are damped by `min(1, FANOUT_FREE / fanOut)`, so a 50-way
  selection map scores each edge far lower than a couple of lazy children (a
  modal). Low fan-out (≤ `FANOUT_FREE`) is unchanged.
- **Preload floor** (`$minPreloadProbability$`, default `0.2`): bundles below the
  floor aren't speculatively preloaded. With fan-out damping this drops the
  registry while keeping likely code (modals, a route's components) that scores
  well above it.

A lazy modal (and its handlers) referenced by an on-page component is still
preloaded before the interaction — verified by a new regression test.
