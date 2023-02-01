import type { RouteData } from '@builder.io/qwik-city';
import type { Render } from '@builder.io/qwik/server';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import type { MenuData, RouteModule } from '../../runtime/src/types';
import { getRouteMatchPathname, QwikCityRun, runQwikCity } from './user-response';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import { loadRoute } from '../../runtime/src/routing';

/**
 * @alpha
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<QwikCityRun<T> | null> {
  const { render, qwikCityPlan } = opts;
  const { routes, serverPlugins, menus, cacheModules, trailingSlash, basePathname } = qwikCityPlan;
  const pathname = serverRequestEv.url.pathname;
  const matchPathname = getRouteMatchPathname(pathname, trailingSlash);
  const route = await loadRequestHandlers(
    serverPlugins,
    routes,
    menus,
    cacheModules,
    matchPathname,
    serverRequestEv.request.method,
    render
  );
  if (route) {
    return runQwikCity(serverRequestEv, route[0], route[1], trailingSlash, basePathname);
  }
  return null;
}

async function loadRequestHandlers(
  serverPlugins: RouteModule[] | undefined,
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string,
  method: string,
  renderFn: Render
) {
  const route = await loadRoute(routes, menus, cacheModules, pathname);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    route,
    method,
    renderQwikMiddleware(renderFn)
  );
  if (requestHandlers.length > 0) {
    return [route, requestHandlers] as const;
  }
  return null;
}
