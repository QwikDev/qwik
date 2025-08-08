import type { Render } from '@builder.io/qwik/server';
import { loadRoute } from '../../runtime/src/routing';
import type { RebuildRouteInfoInternal, QwikCityPlan } from '../../runtime/src/types';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { QwikSerializer, ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikCity, type QwikCityRun } from './user-response';

/**
 * The request handler for QwikCity. Called by every integration.
 *
 * @public
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions,
  qwikSerializer: QwikSerializer
): Promise<QwikCityRun<T> | null> {
  const { render, qwikCityPlan, checkOrigin } = opts;
  const pathname = serverRequestEv.url.pathname;
  const matchPathname = getRouteMatchPathname(pathname, qwikCityPlan.trailingSlash);
  const routeAndHandlers = await loadRequestHandlers(
    qwikCityPlan,
    matchPathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render
  );

  if (routeAndHandlers) {
    const [route, requestHandlers] = routeAndHandlers;

    const rebuildRouteInfo: RebuildRouteInfoInternal = async (url: URL) => {
      const matchPathname = getRouteMatchPathname(url.pathname, qwikCityPlan.trailingSlash);
      const routeAndHandlers = await loadRequestHandlers(
        qwikCityPlan,
        matchPathname,
        serverRequestEv.request.method,
        checkOrigin ?? true,
        render
      );

      if (routeAndHandlers) {
        const [loadedRoute, requestHandlers] = routeAndHandlers;
        return { loadedRoute, requestHandlers };
      } else {
        return { loadedRoute: null, requestHandlers: [] };
      }
    };

    return runQwikCity(
      serverRequestEv,
      route,
      requestHandlers,
      rebuildRouteInfo,
      qwikCityPlan.trailingSlash,
      qwikCityPlan.basePathname,
      qwikSerializer
    );
  }
  return null;
}

async function loadRequestHandlers(
  qwikCityPlan: QwikCityPlan,
  pathname: string,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderFn: Render
) {
  const { routes, serverPlugins, menus, cacheModules } = qwikCityPlan;
  const route = await loadRoute(routes, menus, cacheModules, pathname);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    route,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn)
  );
  if (requestHandlers.length > 0) {
    return [route, requestHandlers] as const;
  }
  return null;
}
