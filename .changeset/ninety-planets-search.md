---
'@builder.io/qwik-city': patch
'@builder.io/qwik': patch
---

FIX: `vite` is now a peer dependency of `qwik`, `qwik-city`, `qwik-react` and `qwik-labs`, so that there can be no duplicate imports. This should not have consequences, since all apps also directly depend on `vite`.
