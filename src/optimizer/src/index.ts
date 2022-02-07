export { createOptimizer } from './optimizer';
export * from './types';

/**
 * @alpha
 */
export const versions = {
  qwik: (globalThis as any).QWIK_VERSION as string,
};

// TODO: create separate @builder.io/qwik-rollup package
export type { QwikPluginOptions, QwikViteOptions, QwikViteSSROptions } from './rollup/index';
export { qwikRollup, qwikVite } from './rollup/index';
