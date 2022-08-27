import type { ServiceWorkerBundles, ServiceWorkerLink } from './types';
import { setupServiceWorkerScope } from './setup';

/**
 * @alpha
 */
export const setupServiceWorker = () => {
  if (typeof self !== 'undefined' && typeof bundles !== 'undefined') {
    setupServiceWorkerScope(self as any, bundles, links, libraryBundles);
  }
};

declare const bundles: ServiceWorkerBundles;
declare const links: ServiceWorkerLink[];
declare const libraryBundles: string[];
