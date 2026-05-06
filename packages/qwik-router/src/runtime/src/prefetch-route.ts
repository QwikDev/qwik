import * as qwikRouterConfig from '@qwik-router-config';
import { isBrowser } from '@qwik.dev/core';
// @ts-expect-error no types for preloader yet
import { p as preload } from '@qwik.dev/core/preloader';
import { ensureSlash } from '../../utils/pathname';
import { fetchRouteLoaderData } from './route-loaders';
import { loadRoute } from './routing';
/**
 * Prefetch a route's JS bundles and optionally its loader data.
 *
 * Resolves the route from the trie to get the routeName (for the bundle graph preloader) and
 * `$loaders$` (for data prefetching). The bundle graph is keyed by route name (e.g.
 * `products/[id]/`), not by actual pathname (e.g. `products/123/`).
 *
 * @param url - The URL pathname to prefetch
 * @param prefetchData - Whether to also prefetch loader data
 * @param probability - Bundle preload probability (0-1, default 0.8)
 * @param manifestHash - Build manifest hash for loader URLs (from `useDocumentHead().manifestHash`)
 */
export async function prefetchRoute(
  url: URL,
  prefetchData?: boolean,
  probability = 0.8,
  manifestHash?: string
) {
  if (!isBrowser) {
    return;
  }

  try {
    const loadedRoute = await loadRoute(
      (qwikRouterConfig as any).routes,
      (qwikRouterConfig as any).cacheModules,
      url.pathname
    );
    if (!loadedRoute) {
      return;
    }

    // Preload JS bundles using the route NAME (not pathname) — the bundle graph
    // is keyed by route name (e.g. "products/[id]/") not actual path
    let routeName = loadedRoute.$routeName$;
    routeName = ensureSlash(routeName);
    if (routeName.length > 1 && routeName.startsWith('/')) {
      routeName = routeName.slice(1);
    }
    preload(routeName, probability);

    if (!prefetchData || !manifestHash) {
      return;
    }

    // Prefetch loader data in parallel (fire-and-forget, consume body for caching)
    if (loadedRoute.$loaders$?.length && loadedRoute.$loaderPaths$) {
      const basePath = (qwikRouterConfig as any).basePathname ?? '/';
      for (const hash of loadedRoute.$loaders$) {
        let loaderPath = loadedRoute.$loaderPaths$?.[hash];
        if (!loaderPath) {
          continue;
        }
        if (basePath !== '/' && !loaderPath.startsWith(basePath)) {
          loaderPath = basePath + loaderPath.slice(1);
        }
        fetchRouteLoaderData(hash, loaderPath, manifestHash, {
          pageUrl: url,
          basePath,
        }).catch(() => {});
      }
    }
  } catch {
    // Silently ignore prefetch errors
  }
}
