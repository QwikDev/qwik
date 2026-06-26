export function isGenerator(value: unknown): value is Generator<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Generator<unknown>).next === 'function'
  );
}

export function isAsyncGenerator(value: object): value is AsyncGenerator {
  return !!(value as AsyncGenerator)[Symbol.asyncIterator];
}
