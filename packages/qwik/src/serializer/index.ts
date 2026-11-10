import { createSerializationContext } from './serialization-context';

export {
  createSerializationContext,
  type SeenRef,
  type SerializationContext,
  type SerializedStateRange,
} from './serialization-context';

/**
 * Serialize data to string using SerializationContext.
 *
 * @internal
 */
export async function _serialize<T>(data: T): Promise<string> {
  const context = createSerializationContext(
    null,
    () => '',
    () => {},
    new WeakMap<object, object>()
  );
  context.$addRoot$(data);
  await context.$serialize$();
  return context.$writer$.toString();
}
