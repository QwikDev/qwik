---
'@qwik.dev/core': patch
---

fix(vite): resolve relative SSR/client input paths to absolute before passing to rollup, preventing "[vite-plugin-qwik] Qwik input "src/entry.preview.tsx" not found" errors.

