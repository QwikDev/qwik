---
'@qwik.dev/core': patch
---

FIX: Qwik vite plugin's auto-detection of Qwik library dependencies now walks up the directory tree from Vite's `root` and unions deps from every `package.json` it finds. Previously it only read the `package.json` at `root`, which meant monorepo setups with the Vite root pointing at a sub-project (e.g. an Nx lib) missed Qwik libraries declared at the workspace root. Those libraries then fell through to Vite's pre-bundling, leaving raw `$()` calls in the bundled output and producing the runtime error "Optimizer should replace all usages of $()".
