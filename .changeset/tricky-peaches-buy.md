---
'@qwik.dev/core': minor
---

FEAT: `useSerializer$`, `createSerializer$`: Create a Signal holding a custom serializable value. See {@link useSerializer$} for more details.

`NoSerializeSymbol`: objects that have this symbol will not be serialized.

`SerializerSymbol`: When defined on an object, this function will get called with the object and is expected to returned a serializable object literal representing this object. Use this to remove data cached data, consolidate things, integrate with other libraries, etc.
