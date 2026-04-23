export const target = (
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : // eslint-disable-next-line no-restricted-globals
        typeof global !== 'undefined'
        ? // eslint-disable-next-line no-restricted-globals
          global
        : {}
) as typeof globalThis;
