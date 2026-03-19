import type { Render } from '@qwik.dev/core/server';
import { loadRoute } from '../../runtime/src/routing';
import { type QwikRouterConfig, type RebuildRouteInfoInternal } from '../../runtime/src/types';
export { _asyncRequestStore } from './async-request-store';
import { _asyncRequestStore } from './async-request-store';
import { getRouteMatchPathname } from './request-path';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { runQwikRouter, type QwikRouterRun } from './user-response';

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
      qwikRouterConfigActual = (await import('@qwik-router-config')) as any as QwikRouterConfig;
    }
    qwikRouterConfig = qwikRouterConfigActual;
  }
  if (!qwikRouterConfig) {
    throw new Error('qwikRouterConfig is required.');
  }

  const { pathname, isInternal } = getRouteMatchPathname(serverRequestEv.url.pathname);
  // Ignore requests for .well-known so static servers or other middleware can handle them
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/')) {
    return null;
  }
  // TODO cache pages
  const { loadedRoute, requestHandlers } = await loadRequestHandlers(
    qwikRouterConfig,
    pathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render,
    isInternal
  );

  // When fallthrough is enabled and no route matched, let the adapter handle it
  if (qwikRouterConfig.fallthrough && loadedRoute.$notFound$) {
    return null;
  }

  const rebuildRouteInfo: RebuildRouteInfoInternal = async (url: URL) => {
    // once internal, always internal, don't override
    const { pathname } = getRouteMatchPathname(url.pathname);
    return loadRequestHandlers(
      qwikRouterConfig,
      pathname,
      serverRequestEv.request.method,
      checkOrigin ?? true,
      render,
      isInternal
    );
  };

  return runQwikRouter(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    rebuildRouteInfo,
    qwikRouterConfig.basePathname
  );
}

async function loadRequestHandlers(
  qwikRouterConfig: QwikRouterConfig,
  pathname: string,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderFn: Render,
  isInternal: boolean
) {
  const { routes, serverPlugins, cacheModules } = qwikRouterConfig;
  const loadedRoute = await loadRoute(routes, cacheModules, pathname, isInternal);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    loadedRoute,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn),
    isInternal
  );
  return { loadedRoute, requestHandlers };
}
