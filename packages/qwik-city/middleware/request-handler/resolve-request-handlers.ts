import type { PageModule, RequestEvent, RouteModule } from '../../runtime/src/types';
import type {
  ServerActionInternal,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type { RequestHandler, ServerRequestEvent, UserResponseContext } from './types';
import { validateSerializable } from 'packages/qwik-city/utils/format';
import { isFunction } from 'packages/qwik/src/core/util/types';
import type { Render } from '@builder.io/qwik/server';
import { QDATA_JSON } from './user-response';
import type { RenderOptions } from '@builder.io/qwik';
import { responseQData } from './response-q-data';
import { responsePage } from './response-page';

export const resolveRequestHandlers = (
  routeModules: RouteModule[],
  method: string,
  render: Render
) => {
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
  if (isLastModulePageRoute(routeModules)) {
    requestHandlers.push(renderQwikMiddleware(render));
  }
  return requestHandlers;
};

export function actionsMiddleware(
  serverLoaders: ServerLoaderInternal[],
  serverActions: ServerActionInternal[]
) {
  return async (
    requestEv: RequestEvent,
    userResponseCtx: UserResponseContext,
    serverRequestEv: ServerRequestEvent
  ) => {
    const { method } = requestEv;
    const selectedAction = requestEv.url.searchParams.get('qaction');
    if (method === 'POST' && selectedAction) {
      const action = serverActions.find((a) => a.__qrl.getHash() === selectedAction);
      if (action) {
        const form = await requestEv.request.formData();
        const actionResolved = await action.__qrl(form, requestEv as any);
        userResponseCtx.loaders[selectedAction] = actionResolved;
      }
    }

    if (serverLoaders.length > 0) {
      // if (userResponse.bodySent) {
      //   throw new Error('Body already sent');
      // }

      const isDevMode = serverRequestEv.mode === 'dev';

      await Promise.all(
        serverLoaders.map(async (loader) => {
          const loaderId = loader.__qrl.getHash();
          const loaderResolved = await loader.__qrl(requestEv as any);
          userResponseCtx.loaders[loaderId] = isFunction(loaderResolved)
            ? loaderResolved()
            : loaderResolved;

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

function isLastModulePageRoute(routeModules: RouteModule[]) {
  const lastRouteModule = routeModules[routeModules.length - 1];
  return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
}

export function renderQwikMiddleware(render: Render, opts?: RenderOptions) {
  return async (requestEv: RequestEvent) => {
    const isPageDataReq = requestEv.pathname.endsWith(QDATA_JSON);
    if (isPageDataReq) {
      return responseQData(requestEv);
    } else {
      return responsePage(requestEv, render, opts);
    }
  };
}
