import qwikRouterConfig from '@qwik-router-config';
import { _serialize, _UNINITIALIZED } from '@qwik.dev/core/internal';
import type { LoaderInternal, RequestHandler } from '../../../runtime/src/types';
import { getPathnameForDynamicRoute } from '../../../utils/pathname';
import {
  getRequestLoaders,
  getRequestLoaderSerializationStrategyMap,
  getRequestMode,
  RequestEventInternal,
} from '../request-event';
import { measure, verifySerializable } from '../resolve-request-handlers';
import type { RequestEvent } from '../types';
import { IsQLoader, IsQLoaderData, QLoaderId } from '../user-response';
import { runValidators } from './validator-utils';

export function loadersMiddleware(routeLoaders: LoaderInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;
    if (requestEv.headersSent) {
      requestEv.exit();
      return;
    }
    const loaders = getRequestLoaders(requestEv);
    const isDev = getRequestMode(requestEv) === 'dev';
    if (routeLoaders.length > 0) {
      const resolvedLoadersPromises = routeLoaders.map((loader) =>
        executeLoader(loader, loaders, requestEv, isDev)
      );
      await Promise.all(resolvedLoadersPromises);
    }
  };
}

export function loaderDataHandler(routeLoaders: LoaderInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    const isQLoaderData = requestEv.sharedMap.has(IsQLoaderData);
    if (!isQLoaderData) {
      return;
    }

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }

    // Set cache headers - cache it as never expires
    requestEv.cacheControl({
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });

    const loaderData = routeLoaders.map((l) => {
      const loaderId = l.__id;
      let loaderRoute = qwikRouterConfig.loaderIdToRoute[loaderId];
      const params = requestEv.params;
      if (Object.keys(params).length > 0) {
        // TODO: use RequestEvRoute?
        const pathname = getPathnameForDynamicRoute(
          requestEv.url.pathname,
          Object.keys(params),
          params
        );
        loaderRoute = pathname;
      }
      return {
        id: loaderId,
        route: loaderRoute,
      };
    });
    requestEv.json(200, { loaderData });
  };
}

export function loaderHandler(routeLoaders: LoaderInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    const isQLoader = requestEv.sharedMap.has(IsQLoader);
    if (!isQLoader) {
      return;
    }

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }
    const loaderId = requestEv.sharedMap.get(QLoaderId);

    // Execute just this loader
    const loaders = getRequestLoaders(requestEv);
    const isDev = getRequestMode(requestEv) === 'dev';

    let loader: LoaderInternal | undefined;
    for (const routeLoader of routeLoaders) {
      if (routeLoader.__id === loaderId) {
        loader = routeLoader;
      } else if (!loaders[routeLoader.__id]) {
        loaders[routeLoader.__id] = _UNINITIALIZED;
      }
    }

    if (!loader) {
      requestEv.json(404, { error: 'Loader not found' });
      return;
    }

    await executeLoader(loader, loaders, requestEv, isDev);

    // Set cache headers - aggressive for loaders
    requestEv.cacheControl({
      maxAge: 300, // 5 minutes
      staleWhileRevalidate: 3600, // 1 hour
    });

    const data = await _serialize([loaders[loaderId]]);

    requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

    // Return just this loader's result
    requestEv.send(200, data);
  };
}

export async function executeLoader(
  loader: LoaderInternal,
  loaders: Record<string, unknown>,
  requestEv: RequestEventInternal,
  isDev: boolean
) {
  const loaderId = loader.__id;

  loaders[loaderId] = runValidators(
    requestEv,
    loader.__validators,
    undefined, // data
    isDev
  )
    .then((res) => {
      if (res.success) {
        if (isDev) {
          return measure<Promise<unknown>>(requestEv, loader.__qrl.getHash(), () =>
            loader.__qrl.call(requestEv, requestEv)
          );
        } else {
          return loader.__qrl.call(requestEv, requestEv);
        }
      } else {
        return requestEv.fail(res.status ?? 500, res.error);
      }
    })
    .then((resolvedLoader) => {
      if (typeof resolvedLoader === 'function') {
        loaders[loaderId] = resolvedLoader();
      } else {
        if (isDev) {
          verifySerializable(resolvedLoader, loader.__qrl);
        }
        loaders[loaderId] = resolvedLoader;
      }
      return resolvedLoader;
    });
  const loadersSerializationStrategy = getRequestLoaderSerializationStrategyMap(requestEv);
  loadersSerializationStrategy.set(loaderId, loader.__serializationStrategy);
  return loaders[loaderId];
}
