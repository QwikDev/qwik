import { createSerializationContext, serializeBinaryState } from './serialization-context';

export { BinaryStateWriter } from './binary-state-writer';
export { BINARY_VNODE_PREFIX } from './qwik-copy';
export {
  createSerializationContext,
  getBinaryStream,
  serializeBinaryState,
  serializeBinaryStatePatch,
  type SeenRef,
  type SerializationContext,
  type SerializationScope,
} from './serialization-context';

/**
 * Serialize data to string using SerializationContext.
 *
 * @internal
 */
export async function _serialize<T>(data: T): Promise<string> {
  const serializationContext = createSerializationContext(
    null,
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

  serializationContext.$addRoot$(data);
  if (__EXPERIMENTAL__.binaryState) {
    await serializeBinaryState(serializationContext);
  } else {
    await serializationContext.$serialize$();
  }
  return serializationContext.$writer$.toString();
}
