import type { UserResponseContext } from './types';
import type {
  ClientPageData,
  QwikCityEnvData,
  QwikCityMode,
  RequestEvent,
} from '../../runtime/src/types';

export function responseQData(requestEv: RequestEvent) {
  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const qData = getClientPageData(userResponseCtx);
  const stream = requestEv.stream;

  // write just the page json data to the response body
  stream.write(JSON.stringify(qData));

  if (typeof stream.clientData === 'function') {
    // a data fn was provided by the request context
    // useful for writing q-data.json during SSG
    stream.clientData(qData);
  }
  stream.end();
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
