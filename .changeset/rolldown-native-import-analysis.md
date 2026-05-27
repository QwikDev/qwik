---
'@qwik.dev/core': patch
---

fix(vite): strip rolldown-vite's native import-analysis plugin

Under rolldown-vite (Vite 8) the import-analysis-build plugin has a native (Rust) counterpart, `native:import-analysis-build`, which still injects `__vitePreload` wrappers and `__VITE_PRELOAD__` markers into QRL chunks even though Qwik already removes the JS `vite:build-import-analysis` plugin. Add the native plugin name to the removal list so Qwik's own preloader manages dynamic imports as before.
