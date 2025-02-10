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

There are various supported types, but one that is important is the reference type. It refers to a state root by its index. Because of the encoding, the actual data for the state root will be at `(index*2, index*2 + 1)`.

## Serializing

First, all the state roots are walked and awaited to identify objects that are referred to multiple times (including cycles). Any such objects that are added as roots too. This happens in `breakCircularDependenciesAndResolvePromises`.

Then the roots are serialized one by one, and the result is a text stream with occurrences of `</` escaped to prevent injection attacks.

## Restoring

To restore, we use a proxy that will lazily recreate the values.
Restoring a value happens in two steps:

- Allocate: The value is created, but not filled in. The value is stored.
- Inflate: The value is inflated by walking the object graph and filling in the values. Reference cycles will find the value as it is being inflated.

This two-step approach is used to support circular dependencies. By first creating the empty object you can store its reference, which can then already be used while filling in the values. (this is how ESM imports work too)

### Lazy restore

To avoid blocking the main thread on wake, we lazily restore the roots, with caching.

The serialized text is first parsed to get an array of encoded root data.

Then, a proxy gets the raw data and returns an array that deserializes properties on demand and caches them. Objects are also lazily restored.

## Out-of-order streaming

when we allow out-of-order streaming but we want interactivity while the page is still streaming, we can't scan the state once for cycles/Promises/references, because later state might refer to earlier state.

Therefore we must make the serializer single-pass. To do this, we could store each object as a root, but that will make references take more bytes. Instead, we could implement sub-paths for references, and when we encounter a reference, we output that instead.

For later references it would be best to have a root reference, so we'd probably add a root for the sub-reference and later we can refer to that.

We'll still need to keep track of Promises. We can do this by waiting, but that halts streaming. Instead, we could write a forward reference id, and when the promise is resolved, we store the result as the next root item. At the end of the stream we can emit a mapping from forward references to root index.

Then later, when we send out-of-order state, it will append to the existing state on the client.

This single-pass approach might just be better in general, because several bugs were found due to differences between the first and second pass code, and it allows streaming the data while the promises are being resolved.
