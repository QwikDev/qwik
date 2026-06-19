---
'@qwik.dev/core': patch
---

fix(qwik): honor `stopPropagation()` from a deferred event handler so ancestor handlers on the bubbling path no longer run after a descendant stops propagation
