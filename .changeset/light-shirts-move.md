---
'@qwik.dev/core': minor
---

feat: Add an experimental `<Suspense>` component for showing fallback UI when child content takes longer than expected to render.

When rendering on the client, `<Suspense>` shows the `fallback` after the configured delay and keeps it visible until the children are ready. During updates, `showStale` can keep the last resolved content visible while the fallback is shown.

Enable it with `experimental: ['suspense']` in the `qwikVite` plugin.

On SSR, children render normally for now. The boundary also prepares Suspense for future streaming behavior.
