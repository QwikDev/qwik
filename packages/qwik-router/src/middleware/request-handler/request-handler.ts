import type { Render } from '@qwik.dev/core/server';
import { loadRoute } from '../../runtime/src/routing';
import type { QwikRouterConfig, RebuildRouteInfoInternal } from '../../runtime/src/types';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikRouter, type QwikRouterRun } from './user-response';

/**
 * We need to delay importing the config until the first request, because vite also imports from
 * this file and @qwik-router-config doesn't exist from the vite config before the build.
 */
let qwikRouterConfigActual: QwikRouterConfig;
/**
 * The request handler for QwikRouter. Called by every adapter.
 *
 * @public
 */
export async function requestHandler<T = unknown>(
  serverRequestEv: ServerRequestEvent<T>,
  opts: ServerRenderOptions
): Promise<QwikRouterRun<T> | null> {
  const { render, checkOrigin } = opts;
  let { qwikRouterConfig } = opts;
  if (!qwikRouterConfig) {
    if (!qwikRouterConfigActual) {
      qwikRouterConfigActual = await import('@qwik-router-config');
    }
    qwikRouterConfig = qwikRouterConfigActual;
  }
  if (!qwikRouterConfig) {
    throw new Error('qwikRouterConfig is required.');
  }

  const { pathname, isInternal } = getRouteMatchPathname(serverRequestEv.url.pathname);
  // TODO also match 404 routes with extra notFound boolean result
  // TODO cache pages
  const routeAndHandlers = await loadRequestHandlers(
    qwikRouterConfig,
    pathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render,
    isInternal
  );

  if (routeAndHandlers) {
    const [route, requestHandlers] = routeAndHandlers;

    const rebuildRouteInfo: RebuildRouteInfoInternal = async (url: URL) => {
      // once internal, always internal, don't override
      const { pathname } = getRouteMatchPathname(url.pathname);
      const routeAndHandlers = await loadRequestHandlers(
        qwikRouterConfig,
        pathname,
        serverRequestEv.request.method,
        checkOrigin ?? true,
        render,
        isInternal
      );

      if (routeAndHandlers) {
        const [loadedRoute, requestHandlers] = routeAndHandlers;
        return { loadedRoute, requestHandlers };
      } else {
        return { loadedRoute: null, requestHandlers: [] };
      }
    };

    return runQwikRouter(
      serverRequestEv,
      route,
      requestHandlers,
      rebuildRouteInfo,
      qwikRouterConfig.basePathname
    );
  }
  return null;
}

async function loadRequestHandlers(
  qwikRouterConfig: QwikRouterConfig,
  pathname: string,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderFn: Render,
  isInternal: boolean
) {
  const { routes, serverPlugins, menus, cacheModules } = qwikRouterConfig;
  const route = await loadRoute(routes, menus, cacheModules, pathname, isInternal);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    route,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn),
    isInternal
  );
  if (requestHandlers.length > 0) {
    return [route, requestHandlers] as const;
  }
  return null;
}
