---
'@qwik.dev/core': patch
---

fix: SSR subscribes qwikloader to event names as soon as their elements render, so interactions during streaming are not lost
