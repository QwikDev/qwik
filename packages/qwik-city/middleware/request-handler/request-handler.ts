import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, loadUserResponse } from './user-response';
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
    // found and loaded the route for this pathname
    const [params, requestHandlers] = loadedRoute;

    // build endpoint response from each module in the hierarchy
    return loadUserResponse<T>(
      serverRequestEv,
      params,
      requestHandlers,
      trailingSlash,
      basePathname
    );
  }
  return null;
}
