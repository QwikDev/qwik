---
'@builder.io/qwik': patch
---

BREAKING: `useComputed$` no longer accepts Promise results. Instead, use `useSignal` and `useTask$` together to perform async signal updates
