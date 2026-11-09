/**
 * Note: this file gets built separately from the rest of the core module, and is then kept separate
 * in the dist directory via manualChunks. This way it can run before the rest of the core module is
 * loaded, but core can still use it.
 *
 * Here we handle preloading of bundles. See @link{./preloading.md} for more details.
 */

import type { QwikSymbolEvent } from '../shared/jsx/types/jsx-qwik-events';
import { setPreloader } from './bridge';
import { isBrowser } from './constants';
import { preload } from './queue';

// Short names for minification
export { loadBundleGraph as l, parseBundleGraph as g } from './bundle-graph';
export { preload as p } from './queue';

// Here, not in queue.ts: queue and bundle-graph import each other and must both be evaluated
if (isBrowser) {
  setPreloader(preload);

  // Get early hints from qwikloader
  document.addEventListener('qsymbol', (ev) => {
    const { symbol } = (ev as QwikSymbolEvent).detail;
    const hash = symbol.slice(symbol.lastIndexOf('_') + 1);
    // Usage reports speculate; QRL execution requests its chunk separately.
    preload(hash, 0.8);
  });
}
