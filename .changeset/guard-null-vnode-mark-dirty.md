---
'@qwik.dev/core': patch
---

fix: guard null/undefined vNode in markVNodeDirty

Prevent `TypeError: Cannot read properties of undefined (reading 'dirty')` crash in `markVNodeDirty` when callers pass an undefined vNode. This happens when `DomContainer.$destroy$()` is called during async qwikloader dispatch — `$getObjectById$` returns `undefined` for all pending deserialization, so `scheduleTask`, `scheduleEffects`, `_hmr`, `_val`, `_chk`, and `_res` all pass undefined vNodes to `markVNodeDirty`.
