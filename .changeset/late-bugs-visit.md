---
'@builder.io/qwik': patch
---

FIX: dev-mode QRL paths are now handled by Vite so they are the same as the parent paths. You can see this in the Sources section of the browser devtools, where the segments are now always next to their parents (when the parent is loaded).
