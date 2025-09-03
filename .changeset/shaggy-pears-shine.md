---
'@builder.io/qwik': patch
'@builder.io/qwik-city': patch
---

FEAT: All qwik packages are now marked as side effect free in their package.json. This should remove a few unecessary empty imports added by rollup and then not tree-shaken like `import "./preloader.js"`.
