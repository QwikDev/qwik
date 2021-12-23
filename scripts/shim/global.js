if (typeof global == 'undefined') {
  const e =
    'undefined' != typeof globalThis
      ? globalThis
      : 'undefined' != typeof window
      ? window
      : 'undefined' != typeof self
      ? self
      : {};
  e.global = e;
}
