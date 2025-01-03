---
'@qwik.dev/core': minor
---

FEAT: `useSerialized$(fn)` and `createSerialized$(fn)` allow serializing custom objects. You must provide a
function that converts the custom object to a serializable one via the `[SerializerSymbol]`
property, and then provide `use|createSerialized$(fn)` with the function that creates the custom object
from the serialized data. This will lazily create the value when needed.
