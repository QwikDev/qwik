import type { ServiceWorkerBundles } from './types';

export const useCache = (request: Request, response: Response | undefined) => {
  return response && !hasNoCacheHeader(request) && !hasNoCacheHeader(response);
};

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
