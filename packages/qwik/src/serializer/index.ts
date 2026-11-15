import { createSerializationContext } from './serialization-context';

export {
  createSerializationContext,
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
  await serializationContext.$serialize$();
  return serializationContext.$writer$.toString();
}
