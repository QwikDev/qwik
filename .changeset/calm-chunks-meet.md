---
'@qwik.dev/core': patch
---

PERF: `useComputed$` segments are now bundled with the entry that created them instead of getting one tiny chunk each. The runtime resolves the QRL of every serialized computed while resuming, so each separate chunk cost one dynamic `import()` at load.
