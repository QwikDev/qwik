---
'@qwik.dev/core': patch
---

fix: a failed event-handler chunk import after resume is now reported as an `importError` `qerror` (like qwikloader) instead of rendering the raw "Failed to fetch dynamically imported module" message in the nearest `<ErrorBoundary>`
