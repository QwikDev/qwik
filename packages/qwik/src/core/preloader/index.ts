/* eslint-disable no-console */
/**
 * Note: this file gets built separately from the rest of the core module, and is then kept separate
 * in the dist directory via manualChunks. This way it can run before the rest of the core module is
 * loaded, but core can still use it.
 *
 * Here we handle preloading of bundles. See @link{./preloading.md} for more details.
 */

// Short names for minification
export { loadBundleGraph as l, parseBundleGraph as g } from './bundle-graph';
export { preload as p, handleBundle as h } from './queue';
