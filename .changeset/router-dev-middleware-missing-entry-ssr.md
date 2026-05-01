---
'@qwik.dev/router': patch
---

fix(router): don't crash Vite dev when `src/entry.ssr` is missing

The dev middleware called `ssrLoadModule('src/entry.ssr')` unconditionally, so hosts that embed the qwikRouter Vite plugin without an `entry.ssr` (Storybook, component test runners, etc.) crashed the dev server with an unhandled rejection. The load is now wrapped so missing-entry errors fall through to `next()`.
