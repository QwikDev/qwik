/*#__PURE__*/ ((gbl: any) => {
  // ensures unit tests have globalThis on Node10
  // this will be removed from production builds
  if (typeof globalThis === 'undefined') {
    gbl.globalThis = gbl;
  }
})(
  typeof global !== 'undefined'
    ? global
    : typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
    ? self
    : {}
);

// minification can replace the `globalThis.qDev` with `false`
// which will remove all dev code within from the build
export const qDev = (globalThis as any).qDev !== false;
export const qTest = (globalThis as any).describe !== undefined;
export const qGlobal = globalThis as any;
