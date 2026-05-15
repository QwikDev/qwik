---
'@qwik.dev/core': patch
---

FIX: Move singletons to `globalThis.__qwik__`. Same-version coexistence is fine and gets to share the singleton state. On the server, only allow one Qwik version per process. 

This is a necessary step to allow Qwik third party libraries to stay external on the server.
