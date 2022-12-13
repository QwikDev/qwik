import type { ServerRequestEvent, UserResponseContext } from './types';
import type { ClientPageData, QwikCityEnvData, QwikCityMode } from '../../runtime/src/types';
import { getErrorHtml } from './error-handler';
import { HttpStatus } from './http-status-codes';

export function responseQData<T = unknown>(
  serverRequestEv: ServerRequestEvent,
  userResponseCtx: UserResponseContext
): T {
  const requestHeaders: Record<string, string> = {};
  serverRequestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const responseHeaders = userResponseCtx.headers;
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

  return serverRequestEv.response(200, responseHeaders, userResponseCtx.cookie, (stream) => {
    // begin http streaming the page content as it's rendering html
    try {
      userResponseCtx.stream = stream;
      while (userResponseCtx.writeQueue.length > 0) {
        stream.write(userResponseCtx.writeQueue.shift());
      }

      const qData = getClientPageData(userResponseCtx);

      // write just the page json data to the response body
      stream.write(JSON.stringify(qData));

      if (typeof stream.clientData === 'function') {
        // a data fn was provided by the request context
        // useful for writing q-data.json during SSG
        stream.clientData(qData);
      }
    } catch (e) {
      const errorHtml = getErrorHtml(HttpStatus.InternalServerError, e);
      stream.write(errorHtml);
    }
    stream.end();
  });
}

function getClientPageData(userResponseCtx: UserResponseContext) {
  const clientPage: ClientPageData = {
    loaders: userResponseCtx.loaders,
    status: userResponseCtx.status !== 200 ? userResponseCtx.status : undefined,
    redirect:
      (userResponseCtx.status >= 301 &&
        userResponseCtx.status <= 308 &&
        userResponseCtx.headers.get('location')) ||
      undefined,
  };
  return clientPage;
}

export function getQwikCityEnvData(
  requestHeaders: Record<string, string>,
  matchPathname: string,
  userResponseCtx: UserResponseContext,
  locale: string | undefined,
  mode: QwikCityMode
): {
  url: string;
  requestHeaders: Record<string, string>;
  locale: string | undefined;
  qwikcity: QwikCityEnvData;
} {
  const { url, params, status, loaders } = userResponseCtx;
  return {
    url: new URL(matchPathname + url.search, url).href,
    requestHeaders: requestHeaders,
    locale: locale,
    qwikcity: {
      mode: mode,
      params: { ...params },
      response: {
        status: status,
        loaders,
      },
    },
  };
}
