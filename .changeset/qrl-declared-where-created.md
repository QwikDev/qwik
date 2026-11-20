---
'@qwik.dev/core': patch
'@qwik.dev/optimizer': patch
---

fix: the optimizer created a module's qrls before the statements above them had run
