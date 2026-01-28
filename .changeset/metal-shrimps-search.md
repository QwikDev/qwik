---
'@qwik.dev/core': patch
---

fix: we now prevent merging useVisibleTask$ and useComputed$ code together with other segments to prevent overpreloading when their entry contains a lot of transitive imports.
