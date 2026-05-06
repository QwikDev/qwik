import type { Render } from '@qwik.dev/core/server';
import { loadRoute } from '../../runtime/src/routing';
import type { QwikRouterConfig, RebuildRouteInfoInternal } from '../../runtime/src/types';
export { _getAsyncRequestStore } from './async-request-store';
import { trimInternalPathname } from './request-path';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { runQwikRouter, type QwikRouterRun } from './user-response';

let qwikRouterConfig: QwikRouterConfig;

async function getConfig(): Promise<QwikRouterConfig> {
  if (!qwikRouterConfig) {
    qwikRouterConfig = (await import('@qwik-router-config')) as any as QwikRouterConfig;
  }
  return qwikRouterConfig;
}

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
  const config = await getConfig();

  const pathname = trimInternalPathname(serverRequestEv.url.pathname);
  // Ignore requests for .well-known so static servers or other middleware can handle them
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/')) {
    return null;
  }
  // TODO cache pages
  const { loadedRoute, requestHandlers } = await loadRequestHandlers(
    config,
    pathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render
  );

  // When fallthrough is enabled and no route matched, let the adapter handle it
  if (config.fallthrough && loadedRoute.$notFound$) {
    return null;
  }

  const rebuildRouteInfo: RebuildRouteInfoInternal = async (url: URL) => {
    const cleanPathname = trimInternalPathname(url.pathname);
    return loadRequestHandlers(
      config,
      cleanPathname,
      serverRequestEv.request.method,
      checkOrigin ?? true,
      render
    );
  };

  return runQwikRouter(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    rebuildRouteInfo,
    config.basePathname
  );
}

async function loadRequestHandlers(
  qwikRouterConfig: QwikRouterConfig,
  pathname: string,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderFn: Render
) {
  const { routes, serverPlugins, cacheModules } = qwikRouterConfig;
  const loadedRoute = await loadRoute(routes, cacheModules, pathname);
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    loadedRoute,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn)
  );
  return { loadedRoute, requestHandlers };
}
