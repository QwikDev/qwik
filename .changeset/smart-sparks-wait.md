---
'@qwik.dev/compiler': patch
'@qwik.dev/core': patch
---

Complete compiler support for scheduler-driven initial async work, deterministic IDs,
global and scoped styles, and resumable keyed-row index signals. Move collection range, row-shape,
row-ID, component synchrony, static SSR record, and stable props-boundary decisions into target
planning. Inline direct-array rows, pure single-use JSX, known strings, and synchronous local SSR
components while removing redundant batch initialization and eager lazy-component imports.
Transform implicit boundaries in component-free custom-hook modules, run SSR task registrations
through a request-local synchronous-fast-path scheduler, and propagate scoped styles registered by
custom hooks without adding SSR state to the client runtime.
Compile native `bind:value` and `bind:checked` into existing attribute effects and built-in input
QRLs, while normalizing the same bindings through opaque/rest props without adding another
subscriber or serialization format.
Compile native refs into one-shot mount operations, serialize SSR element references through the
reserved `RefVNode` representation, and keep forwarded refs inside the existing props pass.
Implement vdomless `useConstant` as a setup-only untracked initializer without sequential hook
state or serialization.
Support `useStore` factories and the full `deep`/`reactive` options while preserving the default
deep-store hot path and resumable shallow-store subscriptions.
Expose `unwrapStore` and allocation-free `forceStoreEffects` through `@qwik.dev/core`.
Add request-local vdomless `useServerData` for CSR and SSR without serializing the complete server
data object or adding per-component state.
Expose the existing request-safe locale utilities through `@qwik.dev/core` without adding
compiler or runtime indirection.
Atomically promote the target-native compiler and vdomless runtime to the main
`@qwik.dev/core` entrypoint. Public render APIs now receive a root render function and optional
root props, while the internal `(props, ctx)` ABI remains compiler-only. Remove the legacy VNode,
cursor, SSR-JSX, reactive-hook implementations and the `spark` subpath without adding compatibility
renderers or JSX adapters. Keep `internal` as a thin unstable runtime ABI and `testing` as a
compiler-backed vdomless harness. Keep server stateful runtime imports external to the singleton
core module and duplicate only explicitly safe stateless primitives through `qwik-copy`.
