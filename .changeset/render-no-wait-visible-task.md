---
'@qwik.dev/core': patch
---

fix: `render()` no longer waits for `useVisibleTask$` to complete. Visible tasks are post-flush side effects and run independently; gating render on them broke transient-state testing (e.g. loading-state assertions before a fetch resolves) and diverged from v1 behavior. Errors thrown inside an async visible task are now surfaced via `container.handleError` (and ErrorBoundary) instead of through the awaited `render()` promise.
