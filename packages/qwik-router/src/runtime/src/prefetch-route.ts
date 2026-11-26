import { isBrowser, isDev } from '@qwik.dev/core';
import { preloadRouteBundles } from './client-navigate';
import { fetchRouteLoaderData, getModuleRouteLoaders } from './route-loaders';
import { getBasePathname, getRouterConfig } from './router-config';
import { getLayoutKeys, getNewLayoutKeys, loadRoute, matchRouteTree } from './routing';
import type { LoadedRoute, RouteModule } from './types';

/**
 * Prefetch a route's JS bundles and optionally its loader data.
 *
 * Resolves the route from the trie to get the routeName (for the bundle graph preloader) and
 * `$loaders$` (for data prefetching). The bundle graph is keyed by route name (e.g.
 * `products/[id]/`), not by actual pathname (e.g. `products/123/`).
 *
 * @param url - The URL pathname to prefetch
 * @param prefetchData - Whether to prefetch loader data
 * @param priority - Preload priority of the route's bundles (0-1, default 0.8)
 * @param manifestHash - Build manifest hash for loader URLs (from `useDocumentHead().manifestHash`)
 * @param prefetchBundle - Whether to prefetch route JS bundles
 * @param currentUrl - The page the navigation leaves, when `location` already shows the new one
 */
export async function prefetchRoute(
  url: URL,
  prefetchData?: boolean,
  priority = 0.8,
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
      preloadRouteBundles('/' + destRoute.routeParts.join('/'), priority, newLayoutKeys);
    }

    const isNavigating = priority === 1;
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
 * Prefetch a route's loader data in parallel (fire-and-forget). The per-nav fetch map dedupes
 * repeat hovers and shares the promise with the navigation's own fetch; the browser HTTP cache
 * handles freshness. Immutable loaders are skipped: they download lazily on first actual read and
 * are then browser-cached for the life of the deploy.
 */
export const prefetchLoaderData = (loadedRoute: LoadedRoute, url: URL, manifestHash: string) => {
  if (!loadedRoute.$loaders$?.length || !loadedRoute.$loaderPaths$) {
    return false;
  }
  const loadersByHash = new Map<string, ReturnType<typeof getModuleRouteLoaders>[number]>();
  for (const loader of getModuleRouteLoaders(loadedRoute.$mods$ as RouteModule[])) {
    loadersByHash.set(loader.__id, loader);
    loadersByHash.set(loader.__qrl.getHash(), loader);
  }
  const basePath = getBasePathname();
  let didPrefetchLoaders = false;
  for (const hash of loadedRoute.$loaders$) {
    const loader = loadersByHash.get(hash);
    if (loader?.__cacheControl === 'immutable') {
      continue;
    }
    let loaderPath = loadedRoute.$loaderPaths$[hash];
    if (!loaderPath) {
      continue;
    }
    if (basePath !== '/' && !loaderPath.startsWith(basePath)) {
      loaderPath = basePath + loaderPath.slice(1);
    }
    fetchRouteLoaderData(loader?.__id ?? hash, loaderPath, manifestHash, {
      pageUrl: url,
      basePath,
    }).catch(() => {});
    didPrefetchLoaders = true;
  }
  return didPrefetchLoaders;
};
