import { _serialize, _UNINITIALIZED } from '@qwik.dev/core/internal';
import type {
  DataValidator,
  LoaderInternal,
  RequestHandler,
  ValidatorReturn,
} from '../../runtime/src/types';
import {
  getRequestLoaders,
  getRequestLoaderSerializationStrategyMap,
  getRequestMode,
} from './request-event';
import { measure, verifySerializable } from './resolve-request-handlers';
import type { RequestEvent } from './types';
import { IsQLoader, IsQLoaderData, QLoaderId } from './user-response';

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

    // Set cache headers - aggressive for loaders
    requestEv.cacheControl({
      maxAge: 300, // 5 minutes
      staleWhileRevalidate: 3600, // 1 hour
    });

    // return loader ids
    const loaderIds = routeLoaders.map((l) => l.__id);
    return requestEv.json(200, { loaderIds });
  };
}

export function singleLoaderHandler(routeLoaders: LoaderInternal[]): RequestHandler {
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

    try {
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
        return requestEv.json(404, { error: 'Loader not found' });
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
      return requestEv.send(200, data);
    } catch (error) {
      console.error(`Loader ${loaderId} failed:`, error);
      return requestEv.json(500, { error: 'Loader execution failed' });
    }
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

export async function runValidators(
  requestEv: RequestEvent,
  validators: DataValidator[] | undefined,
  data: unknown,
  isDev: boolean
) {
  let lastResult: ValidatorReturn = {
    success: true,
    data,
  };
  if (validators) {
    for (const validator of validators) {
      if (isDev) {
        lastResult = await measure(requestEv, `validator$`, () =>
          validator.validate(requestEv, data)
        );
      } else {
        lastResult = await validator.validate(requestEv, data);
      }
      if (!lastResult.success) {
        return lastResult;
      } else {
        data = lastResult.data;
      }
    }
  }
  return lastResult;
}
