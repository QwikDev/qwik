---
'@qwik.dev/devtools': patch
---

refactor(devtools): generate the extension VNode bridge from one shared source

The browser extension's `public/vnode-bridge.js` duplicated the VNode bridge logic
(tree building, prop serialization, name normalization, DOM resolution, highlighting,
component tree update posting) that the Vite plugin already owns via
`__qwik_install_vnode_runtime__` / `createVNodeRuntime()`. It is now generated from
that single canonical source by the extension build (alongside `devtools-hook.js`)
and is no longer committed.
