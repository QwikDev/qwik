import type { ClientPageData, LoadedRoute, PageModule, RouteModule } from '../../runtime/src/types';
import type {
  ServerActionInternal,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type { RequestEvent, RequestHandler } from './types';
import {
  getRequestAction,
  getRequestLoaders,
  getRequestMode,
  RequestEventInternal,
  setRequestAction,
} from './request-event';
import { QACTION_KEY } from '../../runtime/src/constants';
import { isQDataJson, QDATA_JSON } from './user-response';
import { validateSerializable } from '../../utils/format';
import { HttpStatus } from './http-status-codes';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';
import { getQwikCityServerData } from './response-page';
import { RedirectMessage } from './redirect-handler';

export const resolveRequestHandlers = (
  serverPlugins: RouteModule[] | undefined,
  route: LoadedRoute | null,
  method: string,
  renderHandler: RequestHandler
) => {
  const serverLoaders: ServerLoaderInternal[] = [];
  const serverActions: ServerActionInternal[] = [];
  const requestHandlers: RequestHandler[] = [];
  const isPageRoute = !!(route && isLastModulePageRoute(route[1]));
  if (serverPlugins) {
    _resolveRequestHandlers(
      serverLoaders,
      serverActions,
      requestHandlers,
      serverPlugins,
      isPageRoute,
      method
    );
  }

  if (route) {
    if (isPageRoute) {
      requestHandlers.push(fixTrailingSlash);
      requestHandlers.push(renderQData);
    }
    _resolveRequestHandlers(
      serverLoaders,
      serverActions,
      requestHandlers,
      route[1],
      isPageRoute,
      method
    );
    if (isPageRoute) {
      if (serverLoaders.length + actionsMiddleware.length > 0) {
        requestHandlers.push(actionsMiddleware(serverLoaders, serverActions) as any);
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
  serverLoaders: ServerLoaderInternal[],
  serverActions: ServerActionInternal[],
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

      const actions = Object.values(routeModule).filter((e) =>
        checkBrand(e, 'server_action')
      ) as any[];

      serverLoaders.push(...loaders);
      serverActions.push(...actions);
    }
  }
};

export const checkBrand = (obj: any, brand: string) => {
  return obj && typeof obj === 'object' && obj.__brand === brand;
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

function fixTrailingSlash({ pathname, url, redirect }: RequestEvent) {
  const trailingSlash = true;
  const basePathname = '/';
  if (!isQDataJson(pathname) && pathname !== basePathname && !pathname.endsWith('.html')) {
    // only check for slash redirect on pages
    if (trailingSlash) {
      // must have a trailing slash
      if (!pathname.endsWith('/')) {
        // add slash to existing pathname
        throw redirect(HttpStatus.Found, pathname + '/' + url.search);
      }
    } else {
      // should not have a trailing slash
      if (pathname.endsWith('/')) {
        // remove slash from existing pathname
        throw redirect(HttpStatus.Found, pathname.slice(0, pathname.length - 1) + url.search);
      }
    }
  }
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

export function securityMiddleware({ method, url, request, error }: RequestEvent) {
  const forbidden =
    method === 'POST' &&
    request.headers.get('origin') !== url.origin &&
    isFormContentType(request.headers);
  if (forbidden) {
    throw error(403, `Cross-site ${request.method} form submissions are forbidden`);
  }
}
export function renderQwikMiddleware(render: Render, opts?: RenderOptions) {
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

    const { readable, writable } = new TextEncoderStream();
    const writableStream = requestEv.getWritableStream();
    const pipe = readable.pipeTo(writableStream);
    const stream = writable.getWriter();
    const status = requestEv.status();
    try {
      const isStatic = getRequestMode(requestEv) === 'static';
      const result = await render({
        stream: stream,
        serverData: getQwikCityServerData(requestEv),
        containerAttributes: {
          ['q:render']: isStatic ? 'static' : '',
        },
      });
      const qData: ClientPageData = {
        loaders: getRequestLoaders(requestEv),
        action: getRequestAction(requestEv),
        status: status !== 200 ? status : 200,
        href: getPathname(requestEv.url, true), // todo
        isStatic: result.isStatic,
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
      action: getRequestAction(requestEv),
      status: status !== 200 ? status : 200,
      href: getPathname(requestEv.url, true), // todo
      redirect: location ?? undefined,
    };
    const writer = requestEv.getWritableStream().getWriter();

    // write just the page json data to the response body
    writer.write(encoder.encode(serializeData(qData)));
    requestEv.sharedMap.set('qData', qData);

    writer.close();
  }
}

function serializeData(data: any) {
  return JSON.stringify(data, (_, value) => {
    if (value instanceof FormData) {
      return {
        __brand: 'formdata',
        value: formDataToArray(value),
      };
    }
    return value;
  });
}

function formDataToArray(formData: FormData) {
  const array: [string, string][] = [];
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      array.push([key, value]);
    } else {
      array.push([key, value.name]);
    }
  });
  return array;
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

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(';', 1)[0].trim() ?? '';
  return types.includes(type);
}

export function isFormContentType(headers: Headers) {
  return isContentType(headers, 'application/x-www-form-urlencoded', 'multipart/form-data');
}
