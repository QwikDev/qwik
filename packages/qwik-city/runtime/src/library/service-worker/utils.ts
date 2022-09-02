import type { AppBundles } from './types';

export const getCacheToDelete = (appBundles: AppBundles, cachedUrls: string[]) => {
  const appBundleNames = Object.keys(appBundles);
  return cachedUrls.filter(
    (url) => !appBundleNames.some((appBundleName) => url.endsWith(appBundleName))
  );
};

export const useCache = (request: Request, response: Response | undefined) =>
  !!response && !hasNoCacheHeader(request) && !hasNoCacheHeader(response);

const hasNoCacheHeader = (r: { headers: Headers }) => {
  const cacheControl = r.headers.get('Cache-Control') || '';
  return cacheControl.includes('no-cache') || cacheControl.includes('max-age=0');
};

export const isAppBundleRequest = (appBundles: AppBundles, requestPathname: string) => {
  for (const appBundleName in appBundles) {
    if (requestPathname.endsWith(appBundleName)) {
      return true;
    }
  }
  return false;
};
