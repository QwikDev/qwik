---
'@qwik.dev/core': patch
'@qwik.dev/router': patch
---

fix: a pending render blocking async task (e.g. a `useTask$` that is still awaiting something) no longer blocks the client navigation. The router waited until the whole container was idle before it started navigating, and a cursor that is only paused on a pending promise counted as busy, so the component was never removed and its `useVisibleTask$` cleanups never ran (#9343).
