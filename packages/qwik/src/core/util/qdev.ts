// minification can replace the `globalThis.qDev` with `false`
// which will remove all dev code within from the build
export const qDev = (globalThis as any).qDev === true;
export const qSerialize = (globalThis as any).qSerialize !== false;
export const qDynamicPlatform = (globalThis as any).qDynamicPlatform !== false;
export const qTest = (globalThis as any).qTest === true;

export const seal = (obj: any) => {
  if (qDev) {
    Object.seal(obj);
  }
};
