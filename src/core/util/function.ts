export function namedFn<T>(name: string, delegate: T): T {
  try {
    return new Function(
      'delegate',
      `return function ${name}() {
        return delegate.apply(this, arguments);
      }`
    )(delegate);
  } catch {
    try {
      Object.defineProperty(delegate, 'name', { value: name });
    } catch {
      // eslint-disable-line no-empty
    }
  }
  return delegate;
}

export function returnUndefined() {
  return undefined;
}
