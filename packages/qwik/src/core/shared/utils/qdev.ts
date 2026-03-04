// same as isDev but separate so we can test
const g = globalThis as any;
export const qDev = g.qDev !== false;
export const qInspector = g.qInspector === true;
export const qSerialize = g.qSerialize !== false;
export const qDynamicPlatform = g.qDynamicPlatform !== false;
export const qTest = g.qTest === true;
export const qRuntimeQrl = g.qRuntimeQrl === true;

export const seal = (obj: any) => {
  if (qDev) {
    Object.seal(obj);
  }
};
