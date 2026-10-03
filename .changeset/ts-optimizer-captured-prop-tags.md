---
'@qwik.dev/core': patch
---

fix: the TypeScript optimizer now resolves destructured props used as JSX tags inside `$` callbacks, like `onClick$={() => render(<Model />)}`
