---
'@builder.io/qwik': patch
---

FEAT: Lib builds no longer perform qwik transformation.

This prevents using unstable internal APIs, and doesn't make a difference for the end user. Library authors are strongly urged to push a new library patch version built with this qwik version, and to add `| ^2.0.0` to their accepted qwik version range.
