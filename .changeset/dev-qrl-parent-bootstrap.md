---
'@qwik.dev/core': patch
---

Dev-mode QRL segments now resolve even when their parent module was never loaded in the requesting Vite server (e.g. Vitest browser mode or SSR rendered in a separate server). The dev server transforms the parent on demand instead of erroring with "module does not exist in the build graph".
