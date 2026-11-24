import { isBrowser, isDev } from '@qwik.dev/core';
import { preloadRouteBundles } from './client-navigate';
import { fetchRouteLoaderData, filterSearchParams, getModuleRouteLoaders } from './route-loaders';
import { getBasePathname, getRouterConfig } from './router-config';
import { getLayoutKeys, getNewLayoutKeys, loadRoute, matchRouteTree } from './routing';
import type { LoadedRoute, LoaderInternal, RouteModule } from './types';

/**
 * Prefetch a route's JS bundles and optionally its loader data.
 *
 * Resolves the route from the trie to get the routeName (for the bundle graph preloader) and
 * `$loaders$` (for data prefetching). The bundle graph is keyed by route name (e.g.
 * `products/[id]/`), not by actual pathname (e.g. `products/123/`).
 *
 * @param url - The URL pathname to prefetch
 * @param prefetchData - Whether to prefetch loader data
 * @param probability - Bundle preload probability (0-1, default 0.8)
 * @param manifestHash - Build manifest hash for loader URLs (from `useDocumentHead().manifestHash`)
 * @param prefetchBundle - Whether to prefetch route JS bundles
 * @param currentUrl - The page the navigation leaves, when `location` already shows the new one
 */
export async function prefetchRoute(
  url: URL,
  prefetchData?: boolean,
  probability = 0.8,
  manifestHash?: string,
  prefetchBundle = true,
  currentUrl?: URL
) {
  if (!isBrowser || isDev) {
    return;
  }

  try {
    const { routes, cacheModules } = await getRouterConfig();

    if (prefetchBundle) {
      // Preload JS bundles using the route NAME (not pathname) — the bundle graph
      // is keyed by route name (e.g. "products/[id]/") not actual path
      const destRoute = matchRouteTree(routes, url.pathname);
      const currentRoute = matchRouteTree(routes, (currentUrl ?? location).pathname);
      const newLayoutKeys = getNewLayoutKeys(
        getLayoutKeys(currentRoute.loaders),
        getLayoutKeys(destRoute.loaders)
      );
      preloadRouteBundles('/' + destRoute.routeParts.join('/'), probability, newLayoutKeys);
    }

    const isNavigating = probability === 1;
    const shouldPrefetchData = !!prefetchData && !!manifestHash;
    if (!isNavigating && !shouldPrefetchData) {
      return;
    }

    const loadedRoute = await loadRoute(routes, cacheModules, url.pathname);
    if (!loadedRoute || !shouldPrefetchData) {
      return;
    }

    prefetchLoaderData(loadedRoute, url, manifestHash);
  } catch {
    // Silently ignore prefetch errors
  }
}

/**
 * Prefetch a route's loader data in parallel (fire-and-forget), fetching each loader as a
 * navigation does — by its id, with its search filter — so the navigation's fetch reuses it. The
 * per-nav fetch map dedupes repeat hovers and shares the promise with the navigation's own fetch;
 * the browser HTTP cache handles freshness. Immutable loaders are skipped: they download lazily on
 * first actual read and are then browser-cached for the life of the deploy.
 */
export const prefetchLoaderData = (loadedRoute: LoadedRoute, url: URL, manifestHash: string) => {
  if (!loadedRoute.$loaders$?.length || !loadedRoute.$loaderPaths$) {
    return;
  }
  // The route tree lists loaders by QRL hash; one hash can be several loaders with their own ids.
  const loadersByHash = new Map<string, LoaderInternal[]>();
  for (const loader of getModuleRouteLoaders(loadedRoute.$mods$ as RouteModule[])) {
    const hash = loader.__qrl.getHash();
    const sharing = loadersByHash.get(hash);
    if (sharing) {
      sharing.push(loader);
    } else {
      loadersByHash.set(hash, [loader]);
    }
  }
  const basePath = getBasePathname();
  for (const hash of new Set(loadedRoute.$loaders$)) {
    let loaderPath = loadedRoute.$loaderPaths$[hash];
    if (!loaderPath) {
      continue;
    }
    if (basePath !== '/' && !loaderPath.startsWith(basePath)) {
      loaderPath = basePath + loaderPath.slice(1);
    }
    for (const loader of loadersByHash.get(hash) ?? [undefined]) {
      if (loader?.__cacheControl === 'immutable') {
        continue;
      }
      let pageUrl = url;
      if (loader?.__search) {
        pageUrl = new URL(url.href);
        pageUrl.search = filterSearchParams(url.searchParams, loader.__search);
      }
      fetchRouteLoaderData(loader?.__id ?? hash, loaderPath, manifestHash, {
        pageUrl,
        basePath,
      }).catch(() => {});
    }
  }
};
