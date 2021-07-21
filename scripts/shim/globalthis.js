if ('undefined' == typeof globalThis) {
  const e =
    'undefined' != typeof global
      ? global
      : 'undefined' != typeof window
      ? window
      : 'undefined' != typeof self
      ? self
      : {};
  e.globalThis = e;
}
