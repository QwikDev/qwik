export const target = (
  typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : {}
) as typeof globalThis;
