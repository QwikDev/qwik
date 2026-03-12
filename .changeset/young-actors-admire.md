---
'@qwik.dev/router': minor
'@qwik.dev/core': minor
---

FEAT: Hot Module Replacement (HMR) support. You now get instant updates in the browser when you change your source code, without losing state. This happens without forcing a resume at load, so everything is fast.
The slight disadvantage is that all components now send their state during development (because now they can always rerender on the client). You can disable HMR and fall back to full page reloads by setting `{devTools: {hmr: false}}` in the `qwikVite()` plugin configuration.
