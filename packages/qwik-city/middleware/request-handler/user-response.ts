import type { ServerRequestEvent } from './types';
import type { PathParams, RequestEvent, RequestHandler } from '@builder.io/qwik-city';
import { createRequestEvent } from './request-event';
import { ErrorResponse, getErrorHtml } from './error-handler';
import { HttpStatus } from './http-status-codes';
import { AbortMessage, RedirectMessage } from './redirect-handler';

export interface QwikCityRun<T> {
  response: Promise<T | null>;
  requestEv: RequestEvent;
  completion: Promise<RequestEvent>;
}

export function runQwikCity<T>(
  serverRequestEv: ServerRequestEvent<T>,
  params: PathParams,
  requestHandlers: RequestHandler<unknown>[],
  trailingSlash = true,
  basePathname = '/'
): QwikCityRun<T> {
  if (requestHandlers.length === 0) {
    throw new ErrorResponse(HttpStatus.NotFound, `Not Found`);
  }

  let resolve: (value: T) => void;
  const responsePromise = new Promise<T>((r) => (resolve = r));
  const requestEv = createRequestEvent(
    serverRequestEv,
    params,
    requestHandlers,
    trailingSlash,
    basePathname,
    resolve!
  );
  return {
    response: responsePromise,
    requestEv,
    completion: runNext(requestEv, resolve!),
  };
}

async function runNext(requestEv: RequestEvent, resolve: (value: any) => void) {
  try {
    await requestEv.next();
  } catch (e) {
    if (e instanceof RedirectMessage) {
      requestEv.getWritableStream().close();
    } else if (e instanceof ErrorResponse) {
      if (!requestEv.headersSent) {
        const html = getErrorHtml(e.status, e);
        requestEv.html(e.status, html);
      }
      console.error(e);
    } else if (!(e instanceof AbortMessage)) {
      if (!requestEv.headersSent) {
        requestEv.status(HttpStatus.InternalServerError);
      }
      throw e;
    }
  }
  resolve(null);
  return requestEv;
}

/**
 * The pathname used to match in the route regex array.
 * A pathname ending with /q-data.json should be treated as a pathname without it.
 */
export function getRouteMatchPathname(pathname: string, trailingSlash: boolean | undefined) {
  if (pathname.endsWith(QDATA_JSON)) {
    const trimEnd = pathname.length - QDATA_JSON_LEN + (trailingSlash ? 1 : 0);
    pathname = pathname.slice(0, trimEnd);
    if (pathname === '') {
      pathname = '/';
    }
  }
  return pathname;
}

export const isQDataJson = (pathname: string) => {
  return pathname.endsWith(QDATA_JSON);
};

export const QDATA_JSON = '/q-data.json';
const QDATA_JSON_LEN = QDATA_JSON.length;

export function isFormContentType(headers: Headers) {
  return isContentType(headers, 'application/x-www-form-urlencoded', 'multipart/form-data');
}

export function isContentType(headers: Headers, ...types: string[]) {
  const type = headers.get('content-type')?.split(';', 1)[0].trim() ?? '';
  return types.includes(type);
}
