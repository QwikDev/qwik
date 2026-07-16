---
'@qwik.dev/devtools': patch
---

refactor(devtools): single canonical devtools hook runtime

The browser extension's injected hook script (`devtools-hook.js`) is now generated
from the same `__qwik_install_hook_runtime__` implementation used by the Vite plugin,
instead of being a hand-maintained duplicate. A new build-time `@qwik.dev/devtools/codegen`
entry exposes the runtime-string builders so both injection paths stay in sync.
