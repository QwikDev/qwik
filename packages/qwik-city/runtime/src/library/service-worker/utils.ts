import type { ServiceWorkerBundles } from './types';

export const getCacheToDelete = (bundles: ServiceWorkerBundles, cachedUrls: string[]) => {
  const bundleNames = Object.keys(bundles);
  return cachedUrls.filter((url) => !bundleNames.some((bundleName) => url.endsWith(bundleName)));
};

export const useCache = (request: Request, response: Response | undefined) =>
  !!response && !hasNoCacheHeader(request) && !hasNoCacheHeader(response);

const hasNoCacheHeader = (r: { headers: Headers }) =>
  (r.headers.get('Cache-Control') || '').includes('no-cache');

export const isBuildRequest = (buildBundles: ServiceWorkerBundles, requestPathname: string) => {
  for (const bundleName in buildBundles) {
    if (requestPathname.endsWith(bundleName)) {
      return true;
    }
  }
  return false;
};
