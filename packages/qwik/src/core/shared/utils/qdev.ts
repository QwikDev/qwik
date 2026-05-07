// Direct `globalThis.X` accesses (no alias) so Terser's `global_defs` engages
// and folds these to literal booleans in production builds, allowing
// `qTest ? testBranch : prodBranch` shims to tree-shake.
export const qDev = (globalThis as any).qDev !== false;
export const qInspector = (globalThis as any).qInspector === true;
export const qDynamicPlatform = (globalThis as any).qDynamicPlatform !== false;
export const qTest = (globalThis as any).qTest === true;
export const qRuntimeQrl = (globalThis as any).qRuntimeQrl === true;

export const seal = (obj: any) => {
  if (qDev) {
    Object.seal(obj);
  }
};
