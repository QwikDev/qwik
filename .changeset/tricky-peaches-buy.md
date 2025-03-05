---
'@qwik.dev/core': minor
---

FEAT: `NoSerializeSymbol`: objects that have this symbol will not be serialized

FEAT: `SerializerSymbol`: The framework will use the function defined on object with symbol `SerializeSymbol` for serialization. The function will get called with the object and is expected to returned a serializable object literal representing this object.

Use this to remove data from object which you do not wish to serialize such as: cached data, consolidate things etc.
