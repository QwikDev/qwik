---
'create-qwik': patch
---

FIX: set sideEffects: false to the lib template, otherwise there might be some side effects imports when building a consumer project.
