---
'eslint-plugin-qwik': patch
---

Add `no-await-navigate-in-use-task` ESLint rule to catch awaiting `useNavigate()` inside blocking `useTask$` callbacks.
