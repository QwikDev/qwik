---
'@builder.io/qwik': minor
---

BREAKING: (slightly) Qwik will no longer scan all modules at build start to detect Qwik modules. Instead, a runtime check is done to prevent duplicate core imports. If you get a runtime error, you need to fix your build settings so they don't externalize qwik-related libraries.
