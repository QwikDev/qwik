import type { RouteData } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import { loadRoute } from 'packages/qwik-city/runtime/src/routing';
import type { MenuData } from 'packages/qwik-city/runtime/src/types';
import { resolveRequestHandlers } from './resolve-request-handlers';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikCity } from './user-response';

export const loadRequestHandlers = async (
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string,
  method: string,
  render: Render
) => {
  const route = await loadRoute(routes, menus, cacheModules, pathname);
  if (route) {
    return [route[0], resolveRequestHandlers(route[1], method, render)] as const;
  }
  return null;
};

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
