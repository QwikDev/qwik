---
'@qwik.dev/core': patch
---

fix: guard undefined vNode in scheduleTask and scheduleEffects

Prevent `TypeError: Cannot read properties of undefined (reading 'dirty')` crash in `markVNodeDirty` when `task.$el$` or `consumer.$el$` is undefined during async event dispatch.
