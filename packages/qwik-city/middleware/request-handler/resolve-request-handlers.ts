import type {
  ClientPageData,
  LoadedRoute,
  PageModule,
  RouteModule,
  ActionInternal,
  LoaderInternal,
  JSONObject,
  ValidatorReturn,
  DataValidator,
} from '../../runtime/src/types';
import type { QwikSerializer, RequestEvent, RequestHandler } from './types';
import {
  getRequestLoaders,
  getRequestMode,
  getRequestTrailingSlash,
  RequestEventInternal,
  RequestEvQwikSerializer,
  RequestEvSharedActionId,
} from './request-event';
import { QACTION_KEY, QFN_KEY } from '../../runtime/src/constants';
import { isQDataJson, QDATA_JSON } from './user-response';
import { HttpStatus } from './http-status-codes';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QRL, _deserializeData, _serializeData } from '@builder.io/qwik';
import { getQwikCityServerData } from './response-page';
import { RedirectMessage } from './redirect-handler';
import { isDev } from '@builder.io/qwik/build';

export const resolveRequestHandlers = (
  serverPlugins: RouteModule[] | undefined,
  route: LoadedRoute | null,
  method: string,
  renderHandler: RequestHandler
) => {
  const routeLoaders: LoaderInternal[] = [];
  const routeActions: ActionInternal[] = [];

  const requestHandlers: RequestHandler[] = [];
  const isPageRoute = !!(route && isLastModulePageRoute(route[1]));
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
    if (isPageRoute) {
      if (method === 'POST') {
        requestHandlers.unshift(securityMiddleware);
        requestHandlers.push(pureServerFunction);
      }
      requestHandlers.push(fixTrailingSlash);
      requestHandlers.push(renderQData);
    }
    _resolveRequestHandlers(
      routeLoaders,
      routeActions,
      requestHandlers,
      route[1],
      isPageRoute,
      method
    );
    if (isPageRoute) {
      if (routeLoaders.length + actionsMiddleware.length > 0) {
        requestHandlers.push(actionsMiddleware(routeLoaders, routeActions) as any);
      }
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
      const loaders = Object.values(routeModule).filter((e) =>
        checkBrand(e, 'server_loader')
      ) as any[];
      routeLoaders.push(...loaders);

      const actions = Object.values(routeModule).filter((e) =>
        checkBrand(e, 'server_action')
      ) as any[];
      routeActions.push(...actions);
    }
  }
};

export const checkBrand = (obj: any, brand: string) => {
  return obj && typeof obj === 'function' && obj.__brand === brand;
};

export function actionsMiddleware(routeLoaders: LoaderInternal[], routeActions: ActionInternal[]) {
  return async (requestEv: RequestEventInternal) => {
    if (requestEv.headersSent) {
      requestEv.exit();
      return;
    }
    const { method } = requestEv;
    const loaders = getRequestLoaders(requestEv);
    const qwikSerializer = requestEv[RequestEvQwikSerializer];
    if (method === 'POST') {
      const selectedAction = requestEv.query.get(QACTION_KEY);
      if (selectedAction) {
        const serverActionsMap = (globalThis as any)._qwikActionsMap as
          | Map<string, ActionInternal>
          | undefined;
        const action =
          routeActions.find((action) => action.__id === selectedAction) ??
          serverActionsMap?.get(selectedAction);
        if (action) {
          requestEv.sharedMap.set(RequestEvSharedActionId, selectedAction);
          const data = await requestEv.parseBody();
          if (!data || typeof data !== 'object') {
            throw new Error('Expected request data to be an object');
          }
          const result = await runValidators(requestEv, action.__validators, data);
          if (!result.success) {
            loaders[selectedAction] = requestEv.fail(result.status ?? 500, result.error);
          } else {
            const actionResolved = await action.__qrl(result.data as JSONObject, requestEv);
            verifySerializable(qwikSerializer, actionResolved, action.__qrl);
            loaders[selectedAction] = actionResolved;
          }
        }
      }
    }

    if (routeLoaders.length > 0) {
      await Promise.all(
        routeLoaders.map((loader) => {
          const loaderId = loader.__id;
          if (isDev) {
            if (loaders[loaderId]) {
              throw new Error(
                `Duplicate loader id "${loaderId}" detected. Please ensure that all loader ids are unique.`
              );
            }
          }
          return (loaders[loaderId] = runValidators(requestEv, loader.__validators, undefined)
            .then((res) => {
              if (res.success) {
                return loader.__qrl(requestEv as any);
              } else {
                return requestEv.fail(res.status ?? 500, res.error);
              }
            })
            .then((loaderResolved) => {
              if (typeof loaderResolved === 'function') {
                loaders[loaderId] = loaderResolved();
              } else {
                verifySerializable(qwikSerializer, loaderResolved, loader.__qrl);
                loaders[loaderId] = loaderResolved;
              }
              return loaderResolved;
            }));
        })
      );
    }
  };
}

async function runValidators(
  requestEv: RequestEvent,
  validators: DataValidator[] | undefined,
  data: unknown
) {
  let lastResult: ValidatorReturn = {
    success: true,
    data,
  };
  if (validators) {
    for (const validator of validators) {
      lastResult = await validator.validate(requestEv, data);
      if (!lastResult.success) {
        return lastResult;
      } else {
        data = lastResult.data;
      }
    }
  }
  return lastResult;
}

async function pureServerFunction(ev: RequestEvent) {
  const fn = ev.query.get(QFN_KEY);
  if (
    fn &&
    ev.request.headers.get('X-QRL') === fn &&
    ev.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    ev.exit();
    const qwikSerializer = (ev as RequestEventInternal)[RequestEvQwikSerializer];
    const data = await ev.parseBody();
    if (Array.isArray(data)) {
      const [qrl, ...args] = data;
      if (isQrl(qrl) && qrl.getHash() === fn) {
        const result = await qrl.apply(ev, args);
        verifySerializable(qwikSerializer, result, qrl);
        ev.headers.set('Content-Type', 'application/qwik-json');
        ev.send(200, await qwikSerializer._serializeData(result, true));
        return;
      }
    }
    throw ev.error(500, 'Invalid request');
  }
}

function fixTrailingSlash(ev: RequestEvent) {
  const trailingSlash = getRequestTrailingSlash(ev);
  const { basePathname, pathname, url } = ev;
  if (!isQDataJson(pathname) && pathname !== basePathname && !pathname.endsWith('.html')) {
    // only check for slash redirect on pages
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        throw ev.redirect(HttpStatus.Found, pathname + '/' + url.search);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        throw ev.redirect(HttpStatus.Found, pathname.slice(0, pathname.length - 1) + url.search);
      }
    }
  }
}

export function verifySerializable(qwikSerializer: QwikSerializer, data: any, qrl: QRL) {
  if (isDev) {
    try {
      qwikSerializer._verifySerializable(data, undefined);
    } catch (e: any) {
      if (e instanceof Error && qrl.dev) {
        (e as any).loc = qrl.dev;
      }
      throw e;
    }
  }
}

export const isQrl = (value: any): value is QRL => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

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

export function securityMiddleware({ url, request, error }: RequestEvent) {
  let inputOrigin = request.headers.get('origin');
  let origin = url.origin;
  if (isDev) {
    // In development, we compare the host instead of the origin.
    inputOrigin = inputOrigin ? new URL(inputOrigin).host : null;
    origin = url.host;
  }
  const forbidden = inputOrigin !== origin;
  if (forbidden) {
    throw error(403, `Cross-site ${request.method} form submissions are forbidden`);
  }
}
export function renderQwikMiddleware(render: Render) {
  return async (requestEv: RequestEvent) => {
    if (requestEv.headersSent) {
      return;
    }
    const isPageDataReq = requestEv.pathname.endsWith(QDATA_JSON);
    if (isPageDataReq) {
      return;
    }
    const requestHeaders: Record<string, string> = {};
    requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

    const responseHeaders = requestEv.headers;
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
    }

    const trailingSlash = getRequestTrailingSlash(requestEv);
    const { readable, writable } = new TextEncoderStream();
    const writableStream = requestEv.getWritableStream();
    const pipe = readable.pipeTo(writableStream, { preventClose: true });
    const stream = writable.getWriter();
    const status = requestEv.status();
    try {
      const isStatic = getRequestMode(requestEv) === 'static';
      const result = await render({
        base: requestEv.basePathname + 'build/',
        stream: stream,
        serverData: getQwikCityServerData(requestEv),
        containerAttributes: {
          ['q:render']: isStatic ? 'static' : '',
        },
      });
      const qData: ClientPageData = {
        loaders: getRequestLoaders(requestEv),
        action: requestEv.sharedMap.get(RequestEvSharedActionId),
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url, trailingSlash),
      };
      if ((typeof result as any as RenderToStringResult).html === 'string') {
        // render result used renderToString(), so none of it was streamed
        // write the already completed html to the stream
        await stream.write((result as any as RenderToStringResult).html);
      }
      requestEv.sharedMap.set('qData', qData);
    } finally {
      await stream.ready;
      await stream.close();
      await pipe;
    }
    // On success, close the stream
    await writableStream.close();
  };
}

export async function renderQData(requestEv: RequestEvent) {
  const isPageDataReq = isQDataJson(requestEv.pathname);
  if (isPageDataReq) {
    try {
      await requestEv.next();
    } catch (err) {
      if (!(err instanceof RedirectMessage)) {
        throw err;
      }
    }
    if (requestEv.headersSent || requestEv.exited) {
      return;
    }

    const status = requestEv.status();
    const location = requestEv.headers.get('Location');
    const trailingSlash = getRequestTrailingSlash(requestEv);
    const isRedirect = status >= 301 && status <= 308 && location;
    if (isRedirect) {
      const adaptedLocation = makeQDataPath(location);
      if (adaptedLocation) {
        requestEv.headers.set('Location', adaptedLocation);
        requestEv.getWritableStream().close();
        return;
      } else {
        requestEv.status(200);
        requestEv.headers.delete('Location');
      }
    }

    const requestHeaders: Record<string, string> = {};
    requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
    requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

    const qData: ClientPageData = {
      loaders: getRequestLoaders(requestEv),
      action: requestEv.sharedMap.get(RequestEvSharedActionId),
      status: status !== 200 ? status : 200,
      href: getPathname(requestEv.url, trailingSlash),
      redirect: location ?? undefined,
    };
    const writer = requestEv.getWritableStream().getWriter();
    const qwikSerializer = (requestEv as RequestEventInternal)[RequestEvQwikSerializer];
    // write just the page json data to the response body
    const data = await qwikSerializer._serializeData(qData, true);
    writer.write(encoder.encode(data));
    requestEv.sharedMap.set('qData', qData);

    writer.close();
  }
}

function makeQDataPath(href: string) {
  if (href.startsWith('/')) {
    const append = QDATA_JSON;
    const url = new URL(href, 'http://localhost');

    const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    return pathname + (append.startsWith('/') ? '' : '/') + append + url.search;
  } else {
    return undefined;
  }
}
