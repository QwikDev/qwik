---
'@qwik.dev/core': major
---

feat: new CSR and SSR rendering written from scratch to speed up performance, improve code readability, and make the code easier to understand for new contributors
feat: added the scheduler to sort chores execution and have more predictable behavior
feat: new faster serialization system
feat: new integration tests that are running with the optimizer
feat: new simpler signals implementation with lazy useComputed$ execution, only when is needed
feat: better HTML streaming
chore: split the useVisibleTask$, useResource$, useTask$, useComputed$ to their own files
