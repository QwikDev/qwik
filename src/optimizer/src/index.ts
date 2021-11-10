export { createOptimizer } from './optimizer';
export * from './types';
export { QwikPluginOptions, qwikRollup } from './rollup/index';

export const versions = {
  qwik: (globalThis as any).QWIK_VERSION,
};
