import type {
  ClientPageData,
  LoadedRoute,
  PageModule,
  RouteModule,
  ActionInternal,
  LoaderInternal,
} from '../../runtime/src/types';
import type { QwikSerializer, RequestEvent, RequestHandler } from './types';
import {
  getRequestLoaders,
  getRequestMode,
  getRequestTrailingSlash,
  RequestEventInternal,
  RequestEvQwikSerializer,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
} from './request-event';
import { QACTION_KEY, QFN_KEY } from '../../runtime/src/constants';
import { isFormContentType, isQDataJson, QDATA_JSON } from './user-response';
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
  const serverLoaders: LoaderInternal[] = [];
  const requestHandlers: RequestHandler[] = [];
  const isPageRoute = !!(route && isLastModulePageRoute(route[1]));
  if (serverPlugins) {
    _resolveRequestHandlers(serverLoaders, requestHandlers, serverPlugins, isPageRoute, method);
  }

  if (route) {
    if (isPageRoute) {
      if (method === 'POST') {
        requestHandlers.push(pureServerFunction);
      }
      requestHandlers.push(fixTrailingSlash);
      requestHandlers.push(renderQData);
    }
    _resolveRequestHandlers(serverLoaders, requestHandlers, route[1], isPageRoute, method);
    if (isPageRoute) {
      if (serverLoaders.length + actionsMiddleware.length > 0) {
        requestHandlers.push(actionsMiddleware(serverLoaders) as any);
      }
      requestHandlers.push(renderHandler);
    }
  }
  if (requestHandlers.length > 0) {
    requestHandlers.unshift(securityMiddleware);
  }
  return requestHandlers;
};

const _resolveRequestHandlers = (
  serverLoaders: LoaderInternal[],
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

      serverLoaders.push(...loaders);
    }
  }
};

export const checkBrand = (obj: any, brand: string) => {
  return obj && typeof obj === 'function' && obj.__brand === brand;
};

export function actionsMiddleware(serverLoaders: LoaderInternal[]) {
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
      const serverActionsMap = (globalThis as any)._qwikActionsMap as Map<string, ActionInternal>;
      if (selectedAction && serverActionsMap) {
        const action = serverActionsMap.get(selectedAction);
        if (action) {
          requestEv.sharedMap.set(RequestEvSharedActionId, selectedAction);

          const isForm = isFormContentType(requestEv.request.headers);
          const req = requestEv.request.clone();
          let data: any;
          if (isForm) {
            const formData = await req.formData();
            requestEv.sharedMap.set(RequestEvSharedActionFormData, formData);
            data = formToObj(formData);
          } else {
            data = await req.json();
          }

          let failed = false;
          if (action.__schema) {
            const validator = await action.__schema;
            const result = await validator.safeParseAsync(data);
            if (!result.success) {
              failed = true;
              if ((globalThis as any).qDev) {
                console.error(
                  '\nVALIDATION ERROR\naction$() zod validated failed',
                  '\n\n  - Received:',
                  data,
                  '\n  - Issues:',
                  result.error.issues
                );
              }
              requestEv.status(400);
              loaders[selectedAction] = {
                __brand: 'fail',
                ...result.error.flatten(),
              } as any;
            } else {
              data = result.data;
            }
          }
          if (!failed) {
            const actionResolved = await action.__qrl(data, requestEv);
            verifySerializable(qwikSerializer, actionResolved, action.__qrl);
            loaders[selectedAction] = actionResolved;
          }
        }
      }
    }

    if (serverLoaders.length > 0) {
      await Promise.all(
        serverLoaders.map((loader) => {
          const loaderId = loader.__id;
          if (isDev) {
            if (loaders[loaderId]) {
              throw new Error(
                `Duplicate loader id "${loaderId}" detected. Please ensure that all loader ids are unique.`
              );
            }
          }
          return (loaders[loaderId] = Promise.resolve()
            .then(() => loader.__qrl(requestEv as any))
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

const formToObj = (formData: FormData): Record<string, any> => {
  // Convert FormData to object
  // Handle nested form input using dot notation
  // Handle array input using square bracket notation
  const obj: any = {};
  formData.forEach((value, key) => {
    const keys = key.split('.').filter((k) => k);
    let current = obj;
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i];
      // Last key
      if (i === keys.length - 1) {
        if (k.endsWith('[]')) {
          k = k.slice(0, -2);
          current[k] = current[k] || [];
          current[k].push(value);
        } else {
          current[k] = value;
        }
      } else {
        current = current[k] = {};
      }
    }
  });
  return obj;
};

async function pureServerFunction(ev: RequestEvent) {
  const fn = ev.query.get(QFN_KEY);
  if (fn && ev.request.headers.get('Content-Type') === 'application/qwik-json') {
    ev.exit();
    const fnHeader = ev.request.headers.get('X-QRL');
    if (fnHeader === fn) {
      const qwikSerializer = (ev as RequestEventInternal)[RequestEvQwikSerializer];
      const data = qwikSerializer._deserializeData(await ev.request.text());
      if (Array.isArray(data)) {
        const [qrl, ...args] = data;
        if (isQrl(qrl) && qrl.getHash() === fn) {
          const result = await qrl(ev, ...args);
          verifySerializable(qwikSerializer, result, qrl);
          ev.headers.set('Content-Type', 'application/qwik-json');
          ev.send(200, await qwikSerializer._serializeData(result, true));
          return;
        }
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

export function securityMiddleware({ method, url, request, error }: RequestEvent) {
  const forbidden =
    method === 'POST' &&
    request.headers.get('origin') !== url.origin &&
    isFormContentType(request.headers);
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
