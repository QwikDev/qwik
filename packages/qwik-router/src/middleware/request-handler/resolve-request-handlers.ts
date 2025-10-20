import { type QRL } from '@qwik.dev/core';
import { _serialize, _UNINITIALIZED, _verifySerializable } from '@qwik.dev/core/internal';
import type { Render, RenderToStringResult } from '@qwik.dev/core/server';
import { QACTION_KEY, QFN_KEY, QLOADER_KEY } from '../../runtime/src/constants';
import {
  LoadedRouteProp,
  type ActionInternal,
  type ClientPageData,
  type DataValidator,
  type JSONObject,
  type LoadedRoute,
  type LoaderInternal,
  type PageModule,
  type RouteModule,
  type ValidatorReturn,
} from '../../runtime/src/types';
import { HttpStatus } from './http-status-codes';
import {
  RequestEvIsRewrite,
  RequestEvShareQData,
  RequestEvShareServerTiming,
  RequestEvSharedActionId,
  RequestRouteName,
  getRequestLoaderSerializationStrategyMap,
  getRequestLoaders,
  getRequestMode,
  type RequestEventInternal,
} from './request-event';
import { getQwikRouterServerData } from './response-page';
import type { ErrorCodes, RequestEvent, RequestEventBase, RequestHandler } from './types';
import { IsQData, QDATA_JSON } from './user-response';
// Import separately to avoid duplicate imports in the vite dev server
import { RedirectMessage, ServerError } from '@qwik.dev/router/middleware/request-handler';

/**
 * This generates the handlers that will be run. They run in the order they are defined. If one
 * calls `.exit()`, the rest of the handlers will be skipped.
 *
 * By awaiting `.next()`, handlers can wait for all subsequent handlers to complete before
 * continuing.
 */
export const resolveRequestHandlers = (
  serverPlugins: RouteModule[] | undefined,
  route: LoadedRoute | null,
  method: string,
  checkOrigin: boolean | 'lax-proto',
  renderHandler: RequestHandler,
  isInternal: boolean
) => {
  const routeLoaders: LoaderInternal[] = [];
  const routeActions: ActionInternal[] = [];

  const requestHandlers: RequestHandler[] = [];

  const isPageRoute = !!(route && isLastModulePageRoute(route[LoadedRouteProp.Mods]));

  // Always handle QData redirects (server plugins might redirect)
  if (isInternal) {
    requestHandlers.push(handleQDataRedirect);
  }
  if (serverPlugins) {
    // Serverplugins run even if no route is matched
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
      // `server$()` can only be called from existing page routes
      if (method === 'POST' || method === 'GET') {
        requestHandlers.push(runServerFunction);
      }

      // Note that we don't care about trailing slash on `server$()` calls
      requestHandlers.push(fixTrailingSlash);

      // If this is a QData request, we short-circuit after running all the loaders/middleware
      if (isInternal) {
        requestHandlers.push(renderQData);
      }
    }

    if (isPageRoute) {
      requestHandlers.push((ev) => {
        // Set the current route name
        ev.sharedMap.set(RequestRouteName, routeName);
      });
      requestHandlers.push(actionsMiddleware(routeActions));
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

export function actionsMiddleware(routeActions: ActionInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;
    if (requestEv.headersSent) {
      requestEv.exit();
      return;
    }
    const { method } = requestEv;
    const loaders = getRequestLoaders(requestEv);
    const isDev = getRequestMode(requestEv) === 'dev';
    if (isDev && method === 'GET') {
      if (requestEv.query.has(QACTION_KEY)) {
        console.warn(
          'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
        );
      }
    }
    if (method === 'POST') {
      const selectedActionId = requestEv.query.get(QACTION_KEY);
      if (selectedActionId) {
        const serverActionsMap = globalThis._qwikActionsMap as
          | Map<string, ActionInternal>
          | undefined;
        const action =
          routeActions.find((action) => action.__id === selectedActionId) ??
          serverActionsMap?.get(selectedActionId);
        if (action) {
          requestEv.sharedMap.set(RequestEvSharedActionId, selectedActionId);
          const data = await requestEv.parseBody();
          if (!data || typeof data !== 'object') {
            throw new Error(
              `Expected request data for the action id ${selectedActionId} to be an object`
            );
          }
          const result = await runValidators(requestEv, action.__validators, data, isDev);
          if (!result.success) {
            loaders[selectedActionId] = requestEv.fail(result.status ?? 500, result.error);
          } else {
            const actionResolved = isDev
              ? await measure(requestEv, action.__qrl.getHash(), () =>
                  action.__qrl.call(requestEv, result.data as JSONObject, requestEv)
                )
              : await action.__qrl.call(requestEv, result.data as JSONObject, requestEv);
            if (isDev) {
              verifySerializable(actionResolved, action.__qrl);
            }
            loaders[selectedActionId] = actionResolved;
          }
        }
      }
    }
  };
}

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
        getRouteLoaderPromise(loader, loaders, requestEv, isDev)
      );
      await Promise.all(resolvedLoadersPromises);
    }
  };
}

export async function getRouteLoaderPromise(
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

function isAsyncIterator(obj: unknown): obj is AsyncIterable<unknown> {
  return obj ? typeof obj === 'object' && Symbol.asyncIterator in obj : false;
}

async function runServerFunction(ev: RequestEvent) {
  const serverFnHash = ev.query.get(QFN_KEY);
  if (
    serverFnHash &&
    ev.request.headers.get('X-QRL') === serverFnHash &&
    ev.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    ev.exit();
    const isDev = getRequestMode(ev) === 'dev';
    const data = await ev.parseBody();
    if (Array.isArray(data)) {
      const [qrl, ...args] = data;
      if (isQrl(qrl) && qrl.getHash() === serverFnHash) {
        let result: unknown;
        try {
          if (isDev) {
            result = await measure(ev, `server_${qrl.getSymbol()}`, () =>
              (qrl as Function).apply(ev, args)
            );
          } else {
            result = await (qrl as Function).apply(ev, args);
          }
        } catch (err) {
          if (err instanceof ServerError) {
            throw ev.error(err.status as ErrorCodes, err.data);
          }
          console.error(`Server function ${serverFnHash} failed:`, err);
          throw ev.error(500, 'Invalid request');
        }
        if (isAsyncIterator(result)) {
          ev.headers.set('Content-Type', 'text/qwik-json-stream');
          const writable = ev.getWritableStream();
          const stream = writable.getWriter();
          for await (const item of result) {
            if (isDev) {
              verifySerializable(item, qrl);
            }
            const message = await _serialize([item]);
            if (ev.signal.aborted) {
              break;
            }
            await stream.write(encoder.encode(`${message}\n`));
          }
          stream.close();
        } else {
          verifySerializable(result, qrl);
          ev.headers.set('Content-Type', 'application/qwik-json');
          const message = await _serialize([result]);
          ev.send(200, message);
        }
        return;
      }
    }
    throw ev.error(500, 'Invalid request');
  }
}

function fixTrailingSlash(ev: RequestEvent) {
  const { basePathname, originalUrl, sharedMap } = ev;
  const { pathname, search } = originalUrl;
  const isQData = sharedMap.has(IsQData);
  if (!isQData && pathname !== basePathname && !pathname.endsWith('.html')) {
    // only check for slash redirect on pages
    if (!globalThis.__NO_TRAILING_SLASH__) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        throw ev.redirect(HttpStatus.MovedPermanently, pathname + '/' + search);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        throw ev.redirect(
          HttpStatus.MovedPermanently,
          pathname.slice(0, pathname.length - 1) + search
        );
      }
    }
  }
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

export const isQrl = (value: any): value is QRL => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

export function isLastModulePageRoute(routeModules: RouteModule[]) {
  const lastRouteModule = routeModules[routeModules.length - 1];
  return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
}

export function getPathname(url: URL) {
  url = new URL(url);
  if (url.pathname.endsWith(QDATA_JSON)) {
    url.pathname = url.pathname.slice(0, -QDATA_JSON.length);
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

function csrfLaxProtoCheckMiddleware(requestEv: RequestEvent) {
  checkCSRF(requestEv, 'lax-proto');
}
function csrfCheckMiddleware(requestEv: RequestEvent) {
  checkCSRF(requestEv);
}
function checkCSRF(requestEv: RequestEvent, laxProto?: 'lax-proto') {
  const isForm = isContentType(
    requestEv.request.headers,
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  );
  if (isForm) {
    const inputOrigin = requestEv.request.headers.get('origin');
    const origin = requestEv.url.origin;
    let forbidden = inputOrigin !== origin;

    // fix https://github.com/QwikDev/qwik/issues/7688
    if (
      forbidden &&
      laxProto &&
      inputOrigin?.replace(/^http(s)?/g, '') === origin.replace(/^http(s)?/g, '')
    ) {
      forbidden = false;
    }

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
      const qData: ClientPageData = {
        loaders: getRequestLoaders(requestEv),
        action: requestEv.sharedMap.get(RequestEvSharedActionId),
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

/** Restore q-data.json on redirect */
async function handleQDataRedirect(requestEv: RequestEvent) {
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

async function renderQData(requestEv: RequestEvent) {
  await requestEv.next();

  if (requestEv.headersSent || requestEv.exited) {
    return;
  }

  const status = requestEv.status();
  const redirectLocation = requestEv.headers.get('Location');

  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  let loaders = getRequestLoaders(requestEv);
  const selectedLoaderIds = requestEv.query.getAll(QLOADER_KEY);

  const hasCustomLoaders = selectedLoaderIds.length > 0;

  if (hasCustomLoaders) {
    const selectedLoaders: Record<string, unknown> = {};
    for (const loaderId of selectedLoaderIds) {
      const loader = loaders[loaderId];
      selectedLoaders[loaderId] = loader;
    }
    loaders = selectedLoaders;
  }

  const qData: ClientPageData = hasCustomLoaders
    ? {
        // send minimal data to the client
        loaders,
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url),
      }
    : {
        loaders,
        action: requestEv.sharedMap.get(RequestEvSharedActionId),
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url),
        redirect: redirectLocation ?? undefined,
        isRewrite: requestEv.sharedMap.get(RequestEvIsRewrite),
      };
  const writer = requestEv.getWritableStream().getWriter();
  // write just the page json data to the response body
  const data = await _serialize([qData]);
  writer.write(encoder.encode(data));
  requestEv.sharedMap.set(RequestEvShareQData, qData);

  writer.close();
}

function makeQDataPath(href: string) {
  if (href.startsWith('/')) {
    if (!href.includes(QDATA_JSON)) {
      const url = new URL(href, 'http://localhost');

      const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      return pathname + QDATA_JSON + url.search;
    }
    return href;
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

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(/;/, 1)[0].trim() ?? '';
  return types.includes(type);
}
