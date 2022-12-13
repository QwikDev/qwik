import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikCity } from './user-response';
import { loadRequestHandlers } from '../../runtime/src/routing';

/**
 * @alpha
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<T | null> {
  const { render, qwikCityPlan } = opts;
  const { routes, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;

  const matchPathname = getRouteMatchPathname(serverRequestEv.url.pathname, trailingSlash);
  const loadedRoute = await loadRequestHandlers(
    routes,
    menus,
    cacheModules,
    matchPathname,
    serverRequestEv.request.method,
    render
  );
  if (loadedRoute) {
    // build endpoint response from each module in the hierarchy
    return runQwikCity<T>(
      serverRequestEv,
      loadedRoute[0],
      loadedRoute[1],
      trailingSlash,
      basePathname
    );
  }
  return null;
}
