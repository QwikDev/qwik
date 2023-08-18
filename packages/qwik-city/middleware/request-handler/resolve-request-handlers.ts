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
import type { QwikSerializer, RequestEvent, RequestEventBase, RequestHandler } from './types';
import {
  getRequestLoaders,
  getRequestMode,
  getRequestTrailingSlash,
  type RequestEventInternal,
  RequestEvQwikSerializer,
  RequestEvSharedActionId,
  RequestRouteName,
} from './request-event';
import { QACTION_KEY, QFN_KEY } from '../../runtime/src/constants';
import { IsQData, QDATA_JSON } from './user-response';
import { HttpStatus } from './http-status-codes';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { QRL, _deserializeData, _serializeData } from '@builder.io/qwik';
import { getQwikCityServerData } from './response-page';
import { RedirectMessage } from './redirect-handler';

export const resolveRequestHandlers = (
  serverPlugins: RouteModule[] | undefined,
  route: LoadedRoute | null,
  method: string,
  checkOrigin: boolean,
  renderHandler: RequestHandler
) => {
  const routeLoaders: LoaderInternal[] = [];
  const routeActions: ActionInternal[] = [];

  const requestHandlers: RequestHandler[] = [];
  const isPageRoute = !!(route && isLastModulePageRoute(route[2]));
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
    const routeName = route[0];
    if (
      checkOrigin &&
      (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
    ) {
      requestHandlers.unshift(csrfCheckMiddleware);
    }
    if (isPageRoute) {
      if (method === 'POST') {
        requestHandlers.push(pureServerFunction);
      }
      requestHandlers.push(fixTrailingSlash);
      requestHandlers.push(renderQData);
    }
    requestHandlers.push(handleRedirect);
    _resolveRequestHandlers(
      routeLoaders,
      routeActions,
      requestHandlers,
      route[2],
      isPageRoute,
      method
    );
    if (isPageRoute) {
      requestHandlers.push((ev) => {
        // Set the current route name
        ev.sharedMap.set(RequestRouteName, routeName);
      });
      requestHandlers.push(actionsMiddleware(routeLoaders, routeActions) as any);
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
      ) as LoaderInternal[];
      routeLoaders.push(...loaders);

      const actions = Object.values(routeModule).filter((e) =>
        checkBrand(e, 'server_action')
      ) as ActionInternal[];
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
    const isDev = getRequestMode(requestEv) === 'dev';
    const qwikSerializer = requestEv[RequestEvQwikSerializer];
    if (isDev && method === 'GET') {
      if (requestEv.query.has(QACTION_KEY)) {
        console.warn(
          'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
        );
      }
    }
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
          const result = await runValidators(requestEv, action.__validators, data, isDev);
          if (!result.success) {
            loaders[selectedAction] = requestEv.fail(result.status ?? 500, result.error);
          } else {
            const actionResolved = isDev
              ? await measure(requestEv, action.__qrl.getSymbol().split('_', 1)[0], () =>
                  action.__qrl.call(requestEv, result.data as JSONObject, requestEv)
                )
              : await action.__qrl.call(requestEv, result.data as JSONObject, requestEv);
            if (isDev) {
              verifySerializable(qwikSerializer, actionResolved, action.__qrl);
            }
            loaders[selectedAction] = actionResolved;
          }
        }
      }
    }

    if (routeLoaders.length > 0) {
      await Promise.all(
        routeLoaders.map((loader) => {
          const loaderId = loader.__id;
          return (loaders[loaderId] = runValidators(
            requestEv,
            loader.__validators,
            undefined,
            isDev
          )
            .then((res) => {
              if (res.success) {
                if (isDev) {
                  return measure(requestEv, loader.__qrl.getSymbol().split('_', 1)[0], () =>
                    loader.__qrl.call(requestEv, requestEv as any)
                  );
                } else {
                  return loader.__qrl.call(requestEv, requestEv as any);
                }
              } else {
                return requestEv.fail(res.status ?? 500, res.error);
              }
            })
            .then((loaderResolved) => {
              if (typeof loaderResolved === 'function') {
                loaders[loaderId] = loaderResolved();
              } else {
                if (isDev) {
                  verifySerializable(qwikSerializer, loaderResolved, loader.__qrl);
                }
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

function isAsyncIterator(obj: any): obj is AsyncIterable<unknown> {
  return obj && typeof obj === 'object' && Symbol.asyncIterator in obj;
}

async function pureServerFunction(ev: RequestEvent) {
  const fn = ev.query.get(QFN_KEY);
  if (
    fn &&
    ev.request.headers.get('X-QRL') === fn &&
    ev.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    ev.exit();
    const isDev = getRequestMode(ev) === 'dev';
    const qwikSerializer = (ev as RequestEventInternal)[RequestEvQwikSerializer];
    const data = await ev.parseBody();
    if (Array.isArray(data)) {
      const [qrl, ...args] = data;
      if (isQrl(qrl) && qrl.getHash() === fn) {
        let result: unknown;
        try {
          if (isDev) {
            result = await measure(ev, `server_${qrl.getSymbol()}`, () => qrl.apply(ev, args));
          } else {
            result = await qrl.apply(ev, args);
          }
        } catch (err) {
          ev.headers.set('Content-Type', 'application/qwik-json');
          ev.send(500, await qwikSerializer._serializeData(err, true));
          return;
        }
        if (isAsyncIterator(result)) {
          ev.headers.set('Content-Type', 'text/qwik-json-stream');
          const writable = ev.getWritableStream();
          const stream = writable.getWriter();
          for await (const item of result) {
            if (isDev) {
              verifySerializable(qwikSerializer, item, qrl);
            }
            const message = await qwikSerializer._serializeData(item, true);
            if (ev.signal.aborted) {
              break;
            }
            await stream.write(encoder.encode(`${message}\n`));
          }
          stream.close();
        } else {
          verifySerializable(qwikSerializer, result, qrl);
          ev.headers.set('Content-Type', 'application/qwik-json');
          const message = await qwikSerializer._serializeData(result, true);
          ev.send(200, message);
        }
        return;
      }
    }
    throw ev.error(500, 'Invalid request');
  }
}

function fixTrailingSlash(ev: RequestEvent) {
  const trailingSlash = getRequestTrailingSlash(ev);
  const { basePathname, pathname, url, sharedMap } = ev;
  const isQData = sharedMap.has(IsQData);
  if (!isQData && pathname !== basePathname && !pathname.endsWith('.html')) {
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
  try {
    qwikSerializer._verifySerializable(data, undefined);
  } catch (e: any) {
    if (e instanceof Error && qrl.dev) {
      (e as any).loc = qrl.dev;
    }
    throw e;
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

export const encoder = /*#__PURE__*/ new TextEncoder();

function csrfCheckMiddleware(requestEv: RequestEvent) {
  const isForm = isContentType(
    requestEv.request.headers,
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  );
  if (isForm) {
    const inputOrigin = requestEv.request.headers.get('origin');
    const origin = requestEv.url.origin;
    const forbidden = inputOrigin !== origin;
    if (forbidden) {
      throw requestEv.error(
        403,
        `CSRF check failed. Cross-site ${requestEv.method} form submissions are forbidden.
The request origin "${inputOrigin}" does not match the server origin "${origin}".`
      );
    }
  }
}
export function renderQwikMiddleware(render: Render) {
  return async (requestEv: RequestEvent) => {
    if (requestEv.headersSent) {
      return;
    }
    const isPageDataReq = requestEv.sharedMap.has(IsQData);
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
      const serverData = getQwikCityServerData(requestEv);
      const result = await render({
        base: requestEv.basePathname + 'build/',
        stream,
        serverData,
        containerAttributes: {
          ['q:render']: isStatic ? 'static' : '',
          ...serverData.containerAttributes,
        },
      });
      const qData: ClientPageData = {
        loaders: getRequestLoaders(requestEv),
        action: requestEv.sharedMap.get(RequestEvSharedActionId),
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url, trailingSlash),
      };
      if (typeof (result as any as RenderToStringResult).html === 'string') {
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

export async function handleRedirect(requestEv: RequestEvent) {
  const isPageDataReq = requestEv.sharedMap.has(IsQData);
  if (isPageDataReq) {
    try {
      await requestEv.next();
    } catch (err) {
      if (!(err instanceof RedirectMessage)) {
        throw err;
      }
    }
    if (requestEv.headersSent) {
      return;
    }

    const status = requestEv.status();
    const location = requestEv.headers.get('Location');
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
  }
}

export async function renderQData(requestEv: RequestEvent) {
  const isPageDataReq = requestEv.sharedMap.has(IsQData);
  if (isPageDataReq) {
    await requestEv.next();

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }

    const status = requestEv.status();
    const location = requestEv.headers.get('Location');
    const trailingSlash = getRequestTrailingSlash(requestEv);

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

function now() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export async function measure<T>(
  requestEv: RequestEventBase,
  name: string,
  fn: () => T
): Promise<T> {
  const start = now();
  try {
    return await fn();
  } finally {
    const duration = now() - start;
    let measurements = requestEv.sharedMap.get('@serverTiming');
    if (!measurements) {
      requestEv.sharedMap.set('@serverTiming', (measurements = []));
    }
    measurements.push([name, duration]);
  }
}

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(/;,/, 1)[0].trim() ?? '';
  return types.includes(type);
}
