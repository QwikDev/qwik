---
'@qwik.dev/core': patch
---

fix: `render()` no longer waits for `useVisibleTask$` to complete. Visible tasks are post-flush side effects and run independently.
