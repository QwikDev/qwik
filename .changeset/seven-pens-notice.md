---
'@builder.io/qwik': patch
---

fix: we now prevent merging useVisibleTask$ code together with other segments to prevent overpreloading when their entry contains a lot of transitive imports.
