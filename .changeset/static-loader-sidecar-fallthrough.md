---
'@qwik.dev/router': patch
---

fix: a prerendered route's loader with no static sidecar now falls through to SSR instead of failing as a missing static asset
