import type { AppBundle, AppSymbols } from './types';

export const getCacheToDelete = (appBundles: AppBundle[], cachedUrls: string[]) =>
  cachedUrls.filter((url) => !appBundles.some((appBundle) => url.endsWith(appBundle[0])));

export const useCache = (request: Request, response: Response | undefined) =>
  !!response && !hasNoCacheHeader(response);

const hasNoCacheHeader = (r: { headers: Headers }) => {
  const cacheControl = r.headers.get('Cache-Control') || '';
  return cacheControl.includes('no-cache') || cacheControl.includes('max-age=0');
};

export const isAppBundleRequest = (appBundles: AppBundle[], requestPathname: string) =>
  appBundles.some((b) => requestPathname.endsWith('/' + b[0]));

export const getAppBundleByName = (appBundles: AppBundle[], appBundleName: string | null) =>
  appBundles.find((b) => b[0] === appBundleName);

export const getAppBundlesNamesFromIds = (appBundles: AppBundle[], bundleIds: number[]) =>
  bundleIds.map((bundleId) => (appBundles[bundleId] ? appBundles[bundleId][0] : null));

export const resolveSymbols = (appSymbols: Map<string, string>, symbolsHashes: string[]) =>
  symbolsHashes.map((s) => appSymbols.get(s)).filter((s) => s != null) as string[];

export const computeAppSymbols = (appBundles: AppBundle[]): AppSymbols => {
  const appSymbols = new Map<string, string>();
  for (const bundle of appBundles) {
    const hashes = bundle[2];
    if (hashes) {
      for (const hash of hashes) {
        appSymbols.set(hash, bundle[0]);
      }
    }
  }
  return appSymbols;
};
