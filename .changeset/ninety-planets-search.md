---
'@builder.io/qwik-city': patch
'@builder.io/qwik': patch
---

FIX: `vite` is now a peer dependency of `qwik` and `qwik-city`, so that there can be no duplicate imports. This should not have consequences, since all apps also directly depend on `vite`.
