import type {
  ClientPageData,
  PageModule,
  RequestEvent,
  RouteModule,
} from '../../runtime/src/types';
import type {
  ServerActionInternal,
  ServerLoaderInternal,
} from '../../runtime/src/server-functions';
import type { Render, RenderToStringResult } from '@builder.io/qwik/server';
import type { RenderOptions } from '@builder.io/qwik';
import type { RequestHandler } from './types';
import {
  getRequestAction,
  getRequestLoaders,
  getRequestMode,
  RequestEventInternal,
  setRequestAction,
} from './request-event';
import { getQwikCityEnvData } from './response-page';
import { QACTION_KEY } from '../../runtime/src/constants';
import { isQDataJson, QDATA_JSON } from './user-response';
import { validateSerializable } from '../../utils/format';
import { RedirectMessage } from './redirect-handler';

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
    try {
      const result = await render({
        stream: stream,
        envData: getQwikCityEnvData(requestEv),
        ...opts,
      });
      if ((typeof result as any as RenderToStringResult).html === 'string') {
        // render result used renderToString(), so none of it was streamed
        // write the already completed html to the stream
        await stream.write((result as any as RenderToStringResult).html);
      }
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
      requestEv.headers.set('Location', makeQDataPath(location));
      requestEv.getWritableStream().close();
      return;
    }

    const requestHeaders: Record<string, string> = {};
    requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
    requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

    const qData: ClientPageData = {
      loaders: getRequestLoaders(requestEv),
      action: getRequestAction(requestEv),
      status: status !== 200 ? status : 200,
      href: getPathname(requestEv.url, true), // todo
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
  const append = QDATA_JSON;
  const url = new URL(href, 'http://localhost');

  const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  return pathname + (append.startsWith('/') ? '' : '/') + append + url.search;
}

export function getPathname(url: URL, trailingSlash: boolean | undefined) {
  if (url.pathname.endsWith(QDATA_JSON)) {
    return url.pathname.slice(0, -QDATA_JSON.length + (trailingSlash ? 1 : 0)) + url.search;
  }
  return url.pathname;
}

export const encoder = /*@__PURE__*/ new TextEncoder();
