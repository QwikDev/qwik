import { type QRL } from '@qwik.dev/core';
import { _verifySerializable } from '@qwik.dev/core/internal';
import type { Render, RenderToStringResult } from '@qwik.dev/core/server';
import {
  LoadedRouteProp,
  type ActionInternal,
  type ClientPageData,
  type LoadedRoute,
  type LoaderInternal,
  type PageModule,
  type RouteModule,
} from '../../runtime/src/types';
import { actionHandler } from './handlers/action-handler';
import { csrfCheckMiddleware, csrfLaxProtoCheckMiddleware } from './handlers/csrf-handler';
import { loaderDataHandler, loaderHandler, loadersMiddleware } from './handlers/loader-handler';
import { fixTrailingSlash } from './handlers/path-handler';
import { qDataHandler } from './handlers/qdata-handler';
import { handleRedirect } from './handlers/redirect-handler';
import { pureServerFunction } from './handlers/server-function-handler';
import {
  RequestEvShareQData,
  RequestEvShareServerTiming,
  RequestRouteName,
  getRequestActions,
  getRequestLoaders,
  getRequestMode,
  recognizeRequest,
} from './request-event';
import { getQwikRouterServerData } from './response-page';
import type { RequestEvent, RequestEventBase, RequestHandler } from './types';
import { IsQAction, IsQData, IsQLoader, IsQLoaderData, QActionId } from './user-response';

export const resolveRequestHandlers = (
  serverPlugins: RouteModule[] | undefined,
  route: LoadedRoute | null,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderHandler: RequestHandler
) => {
  const routeLoaders: LoaderInternal[] = [];
  const routeActions: ActionInternal[] = [];

  const requestHandlers: RequestHandler[] = [];

  const isPageRoute = !!(route && isLastModulePageRoute(route[LoadedRouteProp.Mods]));
  if (serverPlugins) {
    _resolveRequestHandlers(
      routeLoaders,
      routeActions,
      requestHandlers,
      serverPlugins,
      isPageRoute,
      method
    );
  }

  if (route) {
    const routeModules = route[LoadedRouteProp.Mods];
    _resolveRequestHandlers(
      routeLoaders,
      routeActions,
      requestHandlers,
      routeModules,
      isPageRoute,
      method
    );
    const routeName = route[LoadedRouteProp.RouteName];
    if (
      checkOrigin &&
      (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
    ) {
      if (checkOrigin === 'lax-proto') {
        requestHandlers.unshift(csrfLaxProtoCheckMiddleware);
      } else {
        requestHandlers.unshift(csrfCheckMiddleware);
      }
    }
    if (isPageRoute) {
      if (method === 'POST' || method === 'GET') {
        // server$
        requestHandlers.push(pureServerFunction);
      }

      requestHandlers.push((ev) => {
        // Set the current route name
        ev.sharedMap.set(RequestRouteName, routeName);
      });
      requestHandlers.push(fixTrailingSlash);
      requestHandlers.push(handleRedirect);
      requestHandlers.push(loaderDataHandler(routeLoaders));
      requestHandlers.push(loaderHandler(routeLoaders, routeActions));
      requestHandlers.push(actionHandler(routeActions, routeLoaders));
      requestHandlers.push(qDataHandler);
      requestHandlers.push(loadersMiddleware(routeLoaders));
      requestHandlers.push(renderHandler);
    }
  }

  return requestHandlers;
};

const _resolveRequestHandlers = (
  routeLoaders: LoaderInternal[],
  routeActions: ActionInternal[],
  requestHandlers: RequestHandler[],
  routeModules: RouteModule[],
  collectActions: boolean,
  method: string
) => {
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

    if (collectActions) {
      for (const module of Object.values(routeModule)) {
        if (typeof module === 'function') {
          if (module.__brand === 'server_loader') {
            routeLoaders.push(module as LoaderInternal);
          } else if (module.__brand === 'server_action') {
            routeActions.push(module as ActionInternal);
          }
        }
      }
    }
  }
};

export const checkBrand = (obj: any, brand: string) => {
  return obj && typeof obj === 'function' && obj.__brand === brand;
};

export function isQDataRequestBasedOnSharedMap(sharedMap: Map<string, unknown>, headers: Headers) {
  return (
    sharedMap.has(IsQData) ||
    sharedMap.has(IsQLoaderData) ||
    sharedMap.has(IsQLoader) ||
    (sharedMap.has(IsQAction) &&
      // we need to ignore actions without JS enabled and render the page
      headers.get('accept')?.includes('application/json'))
  );
}

export function verifySerializable(data: any, qrl: QRL) {
  try {
    _verifySerializable(data, undefined);
  } catch (e: any) {
    if (e instanceof Error && qrl.dev) {
      (e as any).loc = qrl.dev;
    }
    throw e;
  }
}

export function isLastModulePageRoute(routeModules: RouteModule[]) {
  const lastRouteModule = routeModules[routeModules.length - 1];
  return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
}

export function getPathname(url: URL) {
  url = new URL(url);

  const qDataInfo = recognizeRequest(url.pathname);

  if (qDataInfo) {
    url.pathname = url.pathname.slice(0, -qDataInfo.trimLength);
  }
  if (!globalThis.__NO_TRAILING_SLASH__) {
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
  } else {
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
  }
  // strip internal search params
  const search = url.search.slice(1).replaceAll(/&?q(action|data|func|loaders)=[^&]+/g, '');
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}

export const encoder = /*#__PURE__*/ new TextEncoder();

export function renderQwikMiddleware(render: Render) {
  return async (requestEv: RequestEvent) => {
    if (requestEv.headersSent) {
      return;
    }
    const isPageDataReq = isQDataRequestBasedOnSharedMap(
      requestEv.sharedMap,
      requestEv.request.headers
    );
    if (isPageDataReq) {
      return;
    }
    const requestHeaders: Record<string, string> = {};
    requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

    const responseHeaders = requestEv.headers;
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
    }

    const { readable, writable } = new TextEncoderStream();
    const writableStream = requestEv.getWritableStream();
    const pipe = readable.pipeTo(writableStream, { preventClose: true });
    const stream = writable.getWriter();
    const status = requestEv.status();
    try {
      const isStatic = getRequestMode(requestEv) === 'static';
      const serverData = getQwikRouterServerData(requestEv);
      const result = await render({
        base: requestEv.basePathname + 'build/',
        stream,
        serverData,
        containerAttributes: {
          ['q:render']: isStatic ? 'static' : '',
          ...serverData.containerAttributes,
        },
      });
      const actionId = requestEv.sharedMap.get(QActionId) as string | undefined;
      const qData: ClientPageData = {
        loaders: getRequestLoaders(requestEv),
        action: actionId
          ? {
              id: actionId,
              data: getRequestActions(requestEv)[actionId],
            }
          : undefined,
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url),
      };
      if (typeof (result as any as RenderToStringResult).html === 'string') {
        // render result used renderToString(), so none of it was streamed
        // write the already completed html to the stream
        await stream.write((result as any as RenderToStringResult).html);
      }
      requestEv.sharedMap.set(RequestEvShareQData, qData);
    } finally {
      await stream.ready;
      await stream.close();
      await pipe;
    }
    // On success, close the stream
    await writableStream.close();
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export async function measure<T>(
  requestEv: RequestEventBase,
  name: string,
  fn: () => T
): Promise<Awaited<T>> {
  const start = now();
  try {
    return await fn();
  } finally {
    const duration = now() - start;
    let measurements = requestEv.sharedMap.get(RequestEvShareServerTiming);
    if (!measurements) {
      requestEv.sharedMap.set(RequestEvShareServerTiming, (measurements = []));
    }
    measurements.push([name, duration]);
  }
}
