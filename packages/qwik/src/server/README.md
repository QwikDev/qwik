# SSR package

This package contains the target-native server renderer. Its public entry accepts a compiled root
function, not JSX or a VNode:

```ts
const result = await renderToString(Root, { props });
await renderToStream(Root, { props, stream });
```

## Core boundary

The server bundle must not contain a second copy of stateful Qwik runtime code. Signals, QRLs,
owners, invoke contexts, scheduler-facing state, and serialization contexts are imported from the
external `@qwik.dev/core` entrypoint so compiled components and the server renderer use the same
instances.

`qwik-copy.ts` is the only exception to the relative-core import rule. It explicitly lists small,
stateless constants, types, and utilities that are safe to duplicate in the server bundle. A new
relative import from `src/server` to `src/core` must either become an `@qwik.dev/core` import or be
proven stateless and added to `qwik-copy.ts`; the server build enforces this boundary.
