import type { AppBundle, LinkBundle } from './types';
import { setupServiceWorkerScope } from './setup';
import { computeAppSymbols } from './utils';

/**
 * @alpha
 */
export const setupServiceWorker = () => {
  if (typeof self !== 'undefined' && typeof appBundles !== 'undefined') {
    const appSymbols = computeAppSymbols(appBundles);
    setupServiceWorkerScope(self as any, appBundles, libraryBundleIds, linkBundles, appSymbols);
  }
};

declare const appBundles: AppBundle[];
declare const libraryBundleIds: number[];
declare const linkBundles: LinkBundle[];
