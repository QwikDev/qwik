---
'@qwik.dev/core': patch
---

fix: `useVisibleTask$` cleanups now run when a component is removed while it is about to re-render (for example, a `usePreventNavigate$` handler is now unregistered).
