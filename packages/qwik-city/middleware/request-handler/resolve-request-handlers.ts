import type { PageModule, RouteModule } from '../../runtime/src/types';
import type {
  ServerActionInternal,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type { RequestHandler } from './types';
import {
  getRequestLoaders,
  getRequestMode,
  RequestEventInternal,
  setRequestAction,
} from './request-event';
import { QACTION_KEY } from '../../runtime/src/constants';
import { QDATA_JSON } from './user-response';
import { validateSerializable } from '../../utils/format';

export const resolveRequestHandlers = (routeModules: RouteModule[], method: string) => {
  const requestHandlers: RequestHandler[] = [];
  const serverLoaders: ServerLoaderInternal[] = [];
  const serverActions: ServerActionInternal[] = [];

  for (const routeModule of routeModules) {
    if (typeof routeModule.onRequest === 'function') {
      requestHandlers.push(routeModule.onRequest);
    } else if (Array.isArray(routeModule.onRequest)) {
      requestHandlers.push(...routeModule.onRequest);
    }

    let methodReqHandler: RequestHandler | RequestHandler[] | undefined;
    switch (method) {
      case 'GET': {
        methodReqHandler = routeModule.onGet;
        break;
      }
      case 'POST': {
        methodReqHandler = routeModule.onPost;
        break;
      }
      case 'PUT': {
        methodReqHandler = routeModule.onPut;
        break;
      }
      case 'PATCH': {
        methodReqHandler = routeModule.onPatch;
        break;
      }
      case 'DELETE': {
        methodReqHandler = routeModule.onDelete;
        break;
      }
      case 'OPTIONS': {
        methodReqHandler = routeModule.onOptions;
        break;
      }
      case 'HEAD': {
        methodReqHandler = routeModule.onHead;
        break;
      }
    }

    if (typeof methodReqHandler === 'function') {
      requestHandlers.push(methodReqHandler);
    } else if (Array.isArray(methodReqHandler)) {
      requestHandlers.push(...methodReqHandler);
    }

    const loaders = Object.values(routeModule).filter(
      (e) => e.__brand === 'server_loader'
    ) as any[];

    const actions = Object.values(routeModule).filter(
      (e) => e.__brand === 'server_action'
    ) as any[];

    serverLoaders.push(...loaders);
    serverActions.push(...actions);
  }

  if (serverLoaders.length + actionsMiddleware.length > 0) {
    requestHandlers.push(actionsMiddleware(serverLoaders, serverActions) as any);
  }

  return requestHandlers;
};

export function actionsMiddleware(
  serverLoaders: ServerLoaderInternal[],
  serverActions: ServerActionInternal[]
) {
  return async (requestEv: RequestEventInternal) => {
    if (requestEv.headersSent) {
      requestEv.exit();
      return;
    }
    const { method } = requestEv;
    const loaders = getRequestLoaders(requestEv);

    if (method === 'POST') {
      const selectedAction = requestEv.query.get(QACTION_KEY);
      if (selectedAction) {
        const action = serverActions.find((a) => a.__qrl.getHash() === selectedAction);
        if (action) {
          setRequestAction(requestEv, selectedAction);
          const formData = await requestEv.request.formData();
          const actionResolved = await action.__qrl(formData, requestEv);
          loaders[selectedAction] = actionResolved;
        }
      }
    }

    if (serverLoaders.length > 0) {
      const isDevMode = getRequestMode(requestEv) === 'dev';

      await Promise.all(
        serverLoaders.map(async (loader) => {
          const loaderId = loader.__qrl.getHash();
          const loaderResolved = await loader.__qrl(requestEv as any);
          loaders[loaderId] =
            typeof loaderResolved === 'function' ? loaderResolved() : loaderResolved;

          if (isDevMode) {
            try {
              validateSerializable(loaderResolved);
            } catch (e: any) {
              throw Object.assign(e, {
                id: 'DEV_SERIALIZE',
                method,
              });
            }
          }
        })
      );
    }
  };
}

export function isLastModulePageRoute(routeModules: RouteModule[]) {
  const lastRouteModule = routeModules[routeModules.length - 1];
  return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
}

export function getPathname(url: URL, trailingSlash: boolean | undefined) {
  if (url.pathname.endsWith(QDATA_JSON)) {
    return url.pathname.slice(0, -QDATA_JSON.length + (trailingSlash ? 1 : 0)) + url.search;
  }
  return url.pathname;
}

export const encoder = /*@__PURE__*/ new TextEncoder();
