---
'@qwik.dev/core': patch
---

fix: tasks and event handlers running twice when a computed's code loads late. If that code doesn't arrive within 10 seconds, the run fires a `qerror` event instead of starting.
