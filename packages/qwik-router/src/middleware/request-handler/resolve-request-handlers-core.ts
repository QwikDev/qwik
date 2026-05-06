import { inlinedQrl, isDev, type QRL } from '@qwik.dev/core';
import { _serialize, _verifySerializable } from '@qwik.dev/core/internal';
import type { Render, RenderToStringResult } from '@qwik.dev/core/server';
import type {
  ActionInternal,
  ContentModule,
  DataValidator,
  DocumentHeadProps,
  JSONObject,
  LoadedRoute,
  LoaderInternal,
  PageModule,
  ResolveSyncValue,
  RouteModule,
  ValidatorReturn,
} from '../../runtime/src/types';
import {
  getRouteLoaderCtx,
  getRouteLoaderValues,
  loadRouteLoader,
  setRouteLoaders,
} from '../../runtime/src/route-loaders';
import type { RequestEventInternal } from './request-event-core';
import { loaderHandler } from './handlers/loader-handler';
import { jsonRequestWrapper } from './handlers/json-request-wrapper';
import { actionHandler } from './handlers/action-handler';
import type { ErrorCodes, RequestEvent, RequestEventBase, RequestHandler } from './types';

interface ResolveRequestHandlersDeps {
  QACTION_KEY: string;
  QFN_KEY: string;
  RequestEvETagCacheKey: string;
  RequestEvHttpStatusMessage: string;
  RequestEvShareServerTiming: string;
  RequestEvSharedActionId: string;
  RequestRouteName: string;
  RedirectMessage: new () => InstanceType<typeof import('./redirect-handler').RedirectMessage>;
  ServerError: new <T = any>(
    status: number,
    data: T
  ) => InstanceType<typeof import('./server-error').ServerError<T>>;
  HttpStatus: typeof import('./http-status-codes').HttpStatus;
  encoder: TextEncoder;
  isContentType: typeof import('./request-utils').isContentType;
  getCachedHtml: typeof import('./etag').getCachedHtml;
  getQwikRouterServerData: typeof import('./response-page').getQwikRouterServerData;
  getRequestMode: typeof import('./request-event-core').getRequestMode;
  loadHttpError: () => Promise<unknown>;
  MAX_CACHE_SIZE: number;
  resolveCacheKey: typeof import('./etag').resolveCacheKey;
  resolveETag: typeof import('./etag').resolveETag;
  resolveRouteConfig: typeof import('../../runtime/src/head').resolveRouteConfig;
  setCachedHtml: typeof import('./etag').setCachedHtml;
}

export function createResolveRequestHandlers(deps: ResolveRequestHandlersDeps) {
  const resolveRequestHandlers = (
    serverPlugins: RouteModule[] | undefined,
    route: LoadedRoute,
    method: string,
    checkOrigin: boolean | 'lax-proto',
    renderHandler: RequestHandler
  ) => {
    const routeLoaders: LoaderInternal[] = [];
    const routeActions: ActionInternal[] = [];

    const requestHandlers: RequestHandler[] = [];

    const isPageRoute = !!isLastModulePageRoute(route.$mods$);

    if (isPageRoute) {
      /**
       * JSON request wrapper must be before all middleware so it can rewrite the URL and catch
       * redirects/errors from plugin/route middleware via try/catch on next()
       */
      requestHandlers.push(jsonRequestWrapper());
      requestHandlers.push(serverErrorMiddleware(route, renderHandler));
    }

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

    const routeModules = route.$mods$;
    _resolveRequestHandlers(
      routeLoaders,
      routeActions,
      requestHandlers,
      routeModules,
      isPageRoute,
      method
    );
    const routeName = route.$routeName$;
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
      // Per-loader handler: returns JSON with metadata and exits if IsQLoader is set
      requestHandlers.push(loaderHandler(routeLoaders));
      // Per-action handler: returns JSON and exits if IsQAction + Accept: json
      requestHandlers.push(actionHandler(routeActions, routeLoaders));
      if (method === 'POST' || method === 'GET') {
        requestHandlers.push(runServerFunction);
      }

      if (!route.$notFound$) {
        requestHandlers.push(fixTrailingSlash);
      }
    }

    if (isPageRoute) {
      requestHandlers.push((ev) => {
        ev.sharedMap.set(deps.RequestRouteName, routeName);
      });
      requestHandlers.push(actionsMiddleware(routeActions));
      requestHandlers.push(loadersMiddleware(routeLoaders, route));
      requestHandlers.push(eTagMiddleware(route));
      requestHandlers.push(renderHandler);
    }

    return requestHandlers;
  };

  function _resolveRequestHandlers(
    routeLoaders: LoaderInternal[],
    routeActions: ActionInternal[],
    requestHandlers: RequestHandler[],
    routeModules: RouteModule[],
    collectActions: boolean,
    method: string
  ) {
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
  }

  const checkBrand = (obj: any, brand: string) => {
    return obj && typeof obj === 'function' && obj.__brand === brand;
  };

  function actionsMiddleware(routeActions: ActionInternal[]): RequestHandler {
    return async (requestEvent: RequestEvent) => {
      const requestEv = requestEvent as RequestEventInternal;
      if (requestEv.headersSent) {
        requestEv.exit();
        return;
      }
      const { method } = requestEv;
      if (isDev && method === 'GET') {
        if (requestEv.query.has(deps.QACTION_KEY)) {
          console.warn(
            'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
          );
        }
      }
      if (method === 'POST') {
        const selectedActionId = requestEv.query.get(deps.QACTION_KEY);
        if (selectedActionId) {
          const serverActionsMap = globalThis._qwikActionsMap as
            | Map<string, ActionInternal>
            | undefined;
          const action =
            routeActions.find((action) => action.__id === selectedActionId) ??
            serverActionsMap?.get(selectedActionId);
          if (action) {
            requestEv.sharedMap.set(deps.RequestEvSharedActionId, selectedActionId);
            const data = await requestEv.parseBody();
            if (!data || typeof data !== 'object') {
              throw new Error(
                `Expected request data for the action id ${selectedActionId} to be an object`
              );
            }
            const result = await runValidators(requestEv, action.__validators, data);
            let actionResult: unknown;
            if (!result.success) {
              actionResult = requestEv.fail(result.status ?? 500, result.error);
            } else {
              const actionResolved = isDev
                ? await measure(requestEv, action.__qrl.getHash(), () =>
                    action.__qrl.call(requestEv, result.data as JSONObject, requestEv)
                  )
                : await action.__qrl.call(requestEv, result.data as JSONObject, requestEv);
              if (isDev) {
                verifySerializable(actionResolved, action.__qrl);
              }
              actionResult = actionResolved;
            }
            requestEv.sharedMap.set('@actionResult', actionResult);
          }
        }
      }
    };
  }

  function loadersMiddleware(routeLoaders: LoaderInternal[], route: LoadedRoute): RequestHandler {
    return async (requestEvent: RequestEvent) => {
      const requestEv = requestEvent as RequestEventInternal;
      if (requestEv.headersSent) {
        requestEv.exit();
        return;
      }
      if (routeLoaders.length > 0) {
        // Set up the RouteLoaderCtx with loader paths from the route
        const routeLoaderCtx = getRouteLoaderCtx(requestEv);
        if (route.$loaderPaths$) {
          Object.assign(routeLoaderCtx.loaderPaths, route.$loaderPaths$);
        }

        // Store loader internals so SSG can check __expires
        setRouteLoaders(requestEv, routeLoaders);

        // Run loaders directly and store raw values.
        // Errors/redirects propagate so middleware can catch them (e.g. plugin@errors).
        const loaderValues = getRouteLoaderValues(requestEv);
        await Promise.all(
          routeLoaders.map(async (loader) => {
            loaderValues[loader.__id] = await loadRouteLoader(loader, requestEv);
          })
        );
      }
    };
  }

  function eTagMiddleware(route: LoadedRoute): RequestHandler {
    return (requestEv: RequestEvent) => {
      if (requestEv.headersSent) {
        return;
      }
      if (requestEv.method !== 'GET') {
        return;
      }

      const mods = route.$mods$ as ContentModule[];
      const hasETag = mods.some((m) => {
        if (!m) {
          return false;
        }
        if (m.routeConfig) {
          return typeof m.routeConfig === 'function' || m.routeConfig.eTag !== undefined;
        }
        return (m as PageModule).eTag !== undefined;
      });
      if (!hasETag) {
        return;
      }

      const loaderValues = getRouteLoaderValues(requestEv);
      const getData = ((loaderOrAction: any) => {
        const id = loaderOrAction.__id;
        if (loaderOrAction.__brand === 'server_loader') {
          if (!(id in loaderValues)) {
            throw new Error('Loader not executed for this request.');
          }
          return loaderValues[id];
        }
        return requestEv.sharedMap.get(deps.RequestEvSharedActionId) === id
          ? requestEv.sharedMap.get('@actionResult')
          : undefined;
      }) as ResolveSyncValue;

      const routeLocation = {
        params: requestEv.params,
        url: requestEv.url,
        isNavigating: false as const,
        prevUrl: undefined,
      };

      const status = requestEv.status();
      const config = deps.resolveRouteConfig(getData, routeLocation, mods, '', status);

      const headProps: DocumentHeadProps = {
        head: config.head,
        status,
        withLocale: (fn) => fn(),
        resolveValue: getData,
        ...routeLocation,
      };

      const eTag = deps.resolveETag(config.eTag, headProps);
      if (!eTag) {
        return;
      }

      requestEv.headers.set('ETag', eTag);

      const ifNoneMatch = requestEv.request.headers.get('If-None-Match');
      if (
        ifNoneMatch &&
        (ifNoneMatch === eTag || ifNoneMatch === `W/${eTag}` || `W/${ifNoneMatch}` === eTag)
      ) {
        requestEv.status(304);
        requestEv.send(304 as any, '' as any);
        return;
      }

      if (deps.MAX_CACHE_SIZE <= 0) {
        return;
      }
      const cacheKey = deps.resolveCacheKey(config.cacheKey, status, eTag, requestEv.url.pathname);
      if (!cacheKey) {
        return;
      }

      const cachedHtml = deps.getCachedHtml(cacheKey);
      if (cachedHtml) {
        requestEv.headers.set('Content-Type', 'text/html; charset=utf-8');
        requestEv.headers.set('X-SSR-Cache', 'HIT');
        requestEv.send(status as any, cachedHtml);
        return;
      }

      requestEv.sharedMap.set(deps.RequestEvETagCacheKey, cacheKey);
    };
  }

  function serverErrorMiddleware(
    route: LoadedRoute,
    renderHandler: RequestHandler
  ): RequestHandler {
    return async (requestEv: RequestEvent) => {
      try {
        await requestEv.next();
      } catch (e) {
        if (!(e instanceof deps.ServerError) || requestEv.headersSent) {
          throw e;
        }

        const accept = requestEv.request.headers.get('Accept');
        if (accept && !accept.includes('text/html')) {
          throw e;
        }

        const status = e.status as number;
        requestEv.status(status);

        const errorLoader = route.$errorLoader$;
        const errorModule = errorLoader ? await errorLoader() : await deps.loadHttpError();

        route.$mods$ = [errorModule as RouteModule];

        requestEv.sharedMap.set(
          deps.RequestEvHttpStatusMessage,
          typeof e.data === 'string' ? e.data : 'Server Error'
        );

        await renderHandler(requestEv);
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
    const serverFnHash = ev.query.get(deps.QFN_KEY);
    if (
      serverFnHash &&
      ev.request.headers.get('X-QRL') === serverFnHash &&
      ev.request.headers.get('Content-Type') === 'application/qwik-json'
    ) {
      ev.exit();
      const data = (await ev.parseBody()) as
        | [args?: unknown[] | undefined, ...captured: unknown[]]
        | undefined;
      if (!Array.isArray(data) || !(Array.isArray(data[0]) || data[0] === undefined)) {
        throw ev.error(500, 'Invalid request');
      }
      const qrl = inlinedQrl(null, serverFnHash, data.slice(1));
      let result: unknown;
      try {
        if (isDev) {
          result = await measure(ev, `server_${serverFnHash}`, () =>
            (qrl as Function).apply(ev, data[0])
          );
        } else {
          result = await (qrl as Function).apply(ev, data[0]);
        }
      } catch (err) {
        if (err instanceof deps.ServerError) {
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
          const message = await _serialize(item);
          if (ev.signal.aborted) {
            break;
          }
          await stream.write(deps.encoder.encode(`${message}\n`));
        }
        stream.close();
      } else {
        verifySerializable(result, qrl);
        ev.headers.set('Content-Type', 'application/qwik-json');
        const message = await _serialize(result);
        ev.send(200, message);
      }
      return;
    }
  }

  function fixTrailingSlash(ev: RequestEvent) {
    const { basePathname, originalUrl } = ev;
    const { pathname, search } = originalUrl;

    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
      return;
    }

    if (pathname !== basePathname && !pathname.endsWith('.html')) {
      if (!globalThis.__NO_TRAILING_SLASH__) {
        if (!pathname.endsWith('/')) {
          throw ev.redirect(deps.HttpStatus.MovedPermanently, pathname + '/' + search);
        }
      } else {
        if (pathname.endsWith('/')) {
          throw ev.redirect(
            deps.HttpStatus.MovedPermanently,
            pathname.slice(0, pathname.length - 1) + search
          );
        }
      }
    }
  }

  function verifySerializable(data: any, qrl: QRL) {
    try {
      _verifySerializable(data, undefined);
    } catch (e: any) {
      if (e instanceof Error && qrl.dev) {
        (e as any).loc = qrl.dev;
      }
      throw e;
    }
  }

  const isQrl = (value: any): value is QRL => {
    return typeof value === 'function' && typeof value.getSymbol === 'function';
  };

  function isLastModulePageRoute(routeModules: RouteModule[]) {
    const lastRouteModule = routeModules[routeModules.length - 1];
    return lastRouteModule && typeof (lastRouteModule as PageModule).default === 'function';
  }

  function getPathname(url: URL) {
    url = new URL(url);
    if (!globalThis.__NO_TRAILING_SLASH__) {
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
      }
    } else {
      if (url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
    }
    const search = url.search.slice(1).replaceAll(/&?q(action|data|func|loaders)=[^&]+/g, '');
    return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  }

  function csrfLaxProtoCheckMiddleware(requestEv: RequestEvent) {
    checkCSRF(requestEv, 'lax-proto');
  }

  function csrfCheckMiddleware(requestEv: RequestEvent) {
    checkCSRF(requestEv);
  }

  function checkCSRF(requestEv: RequestEvent, laxProto?: 'lax-proto') {
    const contentType = requestEv.request.headers.get('content-type');

    const isSimpleRequest =
      !contentType ||
      deps.isContentType(
        requestEv.request.headers,
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain'
      );

    if (isSimpleRequest) {
      const inputOrigin = requestEv.request.headers.get('origin');
      const origin = requestEv.url.origin;
      let forbidden = inputOrigin !== origin;

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

  function renderQwikMiddleware(render: Render) {
    return async (requestEv: RequestEvent) => {
      if (requestEv.headersSent) {
        return;
      }

      const responseHeaders = requestEv.headers;
      if (!responseHeaders.has('Content-Type')) {
        responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
      }

      const eTagCacheKey = requestEv.sharedMap.get(deps.RequestEvETagCacheKey) as
        | string
        | undefined;

      const { readable, writable } = new TextEncoderStream();
      const writableStream = requestEv.getWritableStream();

      let cacheChunks: Uint8Array[] | undefined;
      let pipeSource: ReadableStream<Uint8Array> = readable;
      if (eTagCacheKey) {
        cacheChunks = [];
        const capture = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            cacheChunks!.push(chunk);
            controller.enqueue(chunk);
          },
        });
        pipeSource = readable.pipeThrough(capture);
      }

      const pipe = pipeSource.pipeTo(writableStream, { preventClose: true });
      const stream = writable.getWriter();
      try {
        const isStatic = deps.getRequestMode(requestEv) === 'static';
        const serverData = deps.getQwikRouterServerData(requestEv);
        const result = await render({
          base: requestEv.basePathname + 'build/',
          stream,
          serverData,
          containerAttributes: {
            ['q:render']: isStatic ? 'static' : '',
            ...serverData.containerAttributes,
          },
        });
        if (typeof (result as any as RenderToStringResult).html === 'string') {
          await stream.write((result as any as RenderToStringResult).html);
        }
      } finally {
        await stream.ready;
        await stream.close();
        await pipe;
      }

      if (eTagCacheKey && cacheChunks && cacheChunks.length > 0) {
        const totalLength = cacheChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of cacheChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        deps.setCachedHtml(eTagCacheKey, new TextDecoder().decode(combined));
      }

      await writableStream.close();
    };
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : 0;
  }

  async function measure<T>(
    requestEv: RequestEventBase,
    name: string,
    fn: () => T
  ): Promise<Awaited<T>> {
    const start = now();
    try {
      return await fn();
    } finally {
      const duration = now() - start;
      let measurements = requestEv.sharedMap.get(deps.RequestEvShareServerTiming);
      if (!measurements) {
        requestEv.sharedMap.set(deps.RequestEvShareServerTiming, (measurements = []));
      }
      measurements.push([name, duration]);
    }
  }

  return {
    actionsMiddleware,
    checkBrand,
    checkCSRF,
    fixTrailingSlash,
    getPathname,
    isLastModulePageRoute,
    isQrl,
    loadersMiddleware,
    measure,
    renderQwikMiddleware,
    resolveRequestHandlers,
    verifySerializable,
  };
}
