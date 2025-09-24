# State Serialization

The state is stored as an array of values, called "roots". These roots are either added before serialization starts, or during the serialization.
Some are added during serialization to be able to refer to them from multiple places.

The values are serialized in the following format:

- Even values are always TypeIds, specifying the type of the next value.
- Odd values are the encoded actual values.
  - Then encoded values can only be numbers, strings or arrays
  - Arrays are used to store more complex metadata. Prefer these over encoding data into strings.
  - If a typeId is `undefined`, that means it's been restored already and the value is "raw"
- Array encoded values use the same encoding

There are various supported types, but one that is important is the RootRef type. It refers to a state root by its index. Because of the encoding, the actual data for the state root will be at `(index*2, index*2 + 1)`.

## Serializing

The root values are serialized by walking the object graph depth-first. Each emitted object is remembered in a map, so that if the same object is encountered again, it can be referenced.
When referencing an object that is not a root, we emit a RootRef with a string path to the encoded object. Before deserializing an object, we scan the encoded roots and change these back references by moving the referenced object to the root level and putting a RootRef in its original place.

When encountering Promises, we emit a ForwardRef, which will be filled in later when the promise resolves. At the end of the serialization, we emit the RootRefs for all the ForwardRefs.

## Restoring

Restoring a value happens in two steps:

- Allocate: The value is created, but not filled in. It is stored and can be referenced.
- Inflate: The value is filled in using its serialized data. Reference cycles will find the value as it is being inflated.

### Lazy restore

To avoid blocking the main thread on wake, we lazily restore the roots, with caching.

The serialized text is first parsed to get an array of encoded root data.

Then, a proxy gets the raw data and returns an array that deserializes properties on demand and caches them.
