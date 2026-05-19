---
'@qwik.dev/core': patch
---

fix(cli): defer `build.types` until after `build.lib` finishes so vite's `emptyOutDir` no longer races with tsc and silently wipes the emitted `.d.ts` files. 
