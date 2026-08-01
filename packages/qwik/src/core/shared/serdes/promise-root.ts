/**
 * A deserialized promise travels boxed, because `await` and `maybeThen` flatten thenables and would
 * wait for the value the deserializer has not restored yet.
 */
export class PromiseRoot {
  constructor(readonly promise: Promise<unknown>) {}
}

/** Call this wherever a deserialized value becomes user data. */
export function unwrapPromiseRoot(value: unknown): unknown {
  return value instanceof PromiseRoot ? value.promise : value;
}
