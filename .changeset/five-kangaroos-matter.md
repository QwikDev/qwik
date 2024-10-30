---
'@qwik.dev/core': major
---

💥**BREAKING**: `useComputed` no longer allows Promise returns. (meaning it is strictly sync) Instead, use `useSignal` and `useTask` together to perform async signal updates
