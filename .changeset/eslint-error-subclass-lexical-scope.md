---
'eslint-plugin-qwik': patch
---

`valid-lexical-scope` now allows capturing `Error` subclasses (e.g. `ServerError`) in `$` scopes. Qwik serializes any `instanceof Error`, so subclasses are as safe to capture as a plain `Error`.
