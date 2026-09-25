import { isDev } from '@qwik.dev/core';
import type { Render } from '@qwik.dev/core/server';
import { getRouterConfig } from '../../runtime/src/router-config';
import { loadRoute } from '../../runtime/src/routing';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../runtime/src/route-loaders';
import type { QwikRouterConfig } from '../../runtime/src/types';
import { _asyncRequestStore } from './async-request-store';
import { devPreloadedRouteLoaders } from './dev-preloaded-route-loader';
import {
  IsQLoader,
  recognizeRequest,
  resolveValidInternalFullPathname,
  trimInternalPathname,
  trimRecognizedInternalPathname,
} from './request-path';
import { renderQwikMiddleware, resolveRequestHandlers } from './resolve-request-handlers-core';
import { getStaticPathRedirect } from './static-paths';
import type { ServerRenderOptions, ServerRequestEvent } from './types';
import { runQwikRouter, type QwikRouterRun } from './user-response';

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
  // The server entry registers the generated config; the production build prunes it to the
  // routes the server still serves (see the router config `load`).
  const config = await getRouterConfig();

  const pathname = getRequestHandlerPathname(serverRequestEv);
  // Ignore requests for .well-known so static servers or other middleware can handle them
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/')) {
    return null;
  }
  // Static paths can be pruned from the route trie, so slash-redirects must be read from the static paths list.
  const staticPathRedirect = getStaticPathRedirect(
    serverRequestEv.request.method,
    serverRequestEv.url
  );
  const rebuildRouteInfo = async (url: URL) => {
    const cleanPathname = trimInternalPathname(url.pathname);
    return loadRequestHandlers(
      config,
      cleanPathname,
      serverRequestEv.request.method,
      checkOrigin ?? true,
      render,
      serverRequestEv
    );
  };

  if (staticPathRedirect) {
    return runQwikRouter(
      serverRequestEv,
      { $routeName$: pathname, $params$: {}, $mods$: [] },
      [
        (event) => {
          throw event.redirect(301, staticPathRedirect);
        },
      ],
      rebuildRouteInfo,
      config.basePathname
    );
  }
  // TODO cache pages
  const { loadedRoute, requestHandlers } = await loadRequestHandlers(
    config,
    pathname,
    serverRequestEv.request.method,
    checkOrigin ?? true,
    render,
    serverRequestEv
  );

  // When fallthrough is enabled and no route matched, let the adapter handle it
  if (config.fallthrough && loadedRoute.$notFound$) {
    return null;
  }

  return runQwikRouter(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    rebuildRouteInfo,
    config.basePathname
  );
}

export function getRequestHandlerPathname(
  serverRequestEv: Pick<ServerRequestEvent, 'url' | 'request'>,
  isDevRequest = isDev
) {
  const recognized = recognizeRequest(serverRequestEv.url.pathname);
  if (!recognized) {
    return serverRequestEv.url.pathname;
  }

  const loaderPathname = trimRecognizedInternalPathname(serverRequestEv.url.pathname, recognized);
  if (recognized.type !== IsQLoader) {
    return loaderPathname;
  }

  const routePath =
    serverRequestEv.request.headers.get(FULLPATH_HEADER) ??
    (isDevRequest ? serverRequestEv.request.headers.get(ROUTE_PATH_HEADER) : null);

  return resolveValidInternalFullPathname(loaderPathname, routePath) ?? loaderPathname;
}

async function loadRequestHandlers(
  qwikRouterConfig: QwikRouterConfig,
  pathname: string,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderFn: Render,
  serverRequestEv: ServerRequestEvent
) {
  const { routes, serverPlugins, cacheModules } = qwikRouterConfig;
  const loadedRoute = await loadRoute(routes, cacheModules, pathname);
  const loader = isDev ? devPreloadedRouteLoaders.get(serverRequestEv.request) : undefined;
  const lastModule = loadedRoute.$mods$[loadedRoute.$mods$.length - 1];
  if (loader && lastModule) {
    loadedRoute.$mods$[loadedRoute.$mods$.length - 1] = Object.assign({}, lastModule, {
      __preloadedRouteLoader: loader,
    });
  }
  const requestHandlers = resolveRequestHandlers(
    serverPlugins,
    loadedRoute,
    method,
    checkOrigin,
    renderQwikMiddleware(renderFn)
  );
  return { loadedRoute, requestHandlers };
}
