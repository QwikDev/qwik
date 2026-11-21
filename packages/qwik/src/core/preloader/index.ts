/**
 * Note: this file gets built separately from the rest of the core module, and is then kept separate
 * in the dist directory via manualChunks. This way it can run before the rest of the core module is
 * loaded, but core can still use it.
 *
 * Here we handle preloading of bundles. See @link{./preloading.md} for more details.
 */

import { observeTranslatedText } from '../client/translated-text';
import { setPreloader } from './bridge';
import { doc, isBrowser } from './constants';
import { preload } from './queue';

// Short names for minification
export { loadBundleGraph as l, parseBundleGraph as g } from './bundle-graph';
export { preload as p } from './queue';

// Here, not in queue.ts: queue and bundle-graph import each other and must both be evaluated
if (isBrowser) {
  setPreloader(preload);
  // Core loads too late to see what a page translator replaces right after the page loads.
  observeTranslatedText(doc);
}
