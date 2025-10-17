import { isServer } from '@qwik.dev/core/build';
import type { Render } from '@qwik.dev/core/server';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { loadRoute } from '../../runtime/src/routing';
import type { QwikRouterConfig, RebuildRouteInfoInternal } from '../../runtime/src/types';
import type { RequestEventInternal } from './request-event';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { getRouteMatchPathname, runQwikRouter, type QwikRouterRun } from './user-response';

/** @internal */
export let _asyncRequestStore: AsyncLocalStorage<RequestEventInternal> | undefined;
if (isServer) {
  // TODO when we drop cjs support, await this
  import('node:async_hooks')
    .then((module) => {
      _asyncRequestStore = new module.AsyncLocalStorage();
    })
    .catch((err) => {
      console.warn(
        '\n=====================\n' +
          '  Qwik Router Warning:\n' +
          '    AsyncLocalStorage is not available, continuing without it.\n' +
          '    This impacts concurrent async server calls, where they lose access to the ServerRequestEv object.\n' +
          '=====================\n\n',
        err
      );
    });
}

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
