export function isAsyncGenerator(value: object): value is AsyncGenerator {
  return !!(value as AsyncGenerator)[Symbol.asyncIterator];
}
