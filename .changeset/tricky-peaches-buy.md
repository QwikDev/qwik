---
'@qwik.dev/core': minor
---

FEAT: `NoSerializeSymbol`: objects that have this defined will not be serialized

FEAT: `SerializerSymbol`: objects that have this defined as a function will get it called with the object as a parameter during serialization. The function should return the data that should be serialized.
Use this to remove cached data, consolidate things etc.
