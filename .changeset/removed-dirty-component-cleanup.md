---
'@qwik.dev/core': patch
---

fix: the `useVisibleTask$` cleanups of a removed component now run when the component still had a pending re-render. The abandoned cursor kept its dirty bits but was not linked to the cursor root, so `markVNodeDirty()` skipped it as "already dirty" and the deferred cleanup was never executed (for example a `usePreventNavigate$` handler was never unregistered).
