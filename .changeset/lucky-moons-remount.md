---
'@qwik.dev/core': patch
---

fix: a component without its own dom element no longer rebuilds its children on re-render and keeps its `useOn` document and window events
