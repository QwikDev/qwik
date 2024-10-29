---
'@builder.io/qwik': patch
---

FIX: QRL segment filenames are no longer lowercased. This was giving trouble with parent lookups in dev mode and there was no good reason for it.
