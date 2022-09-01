import type { ServiceWorkerBundles } from './types';
import { setupServiceWorkerScope } from './setup';

/**
 * @alpha
 */
export const setupServiceWorker = () => {
  if (typeof self !== 'undefined' && typeof appBundles !== 'undefined') {
    setupServiceWorkerScope(self as any, appBundles);
  }
};

declare const appBundles: ServiceWorkerBundles;
