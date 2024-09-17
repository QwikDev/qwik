---
'@builder.io/qwik-city': minor
---

FEAT: **(EXPERIMENTAL)** `usePreventNavigate` lets you prevent navigation while your app's state is unsaved. It works asynchronously for SPA navigation and falls back to the browser's default dialogs for other navigations. To use it, add `experimental: ['preventNavigate']` to your `qwikVite` options.
