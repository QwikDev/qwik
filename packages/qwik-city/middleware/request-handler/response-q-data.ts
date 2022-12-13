import type { UserResponseContext } from './types';
import type {
  ClientPageData,
  QwikCityEnvData,
  QwikCityMode,
  RequestEvent,
} from '../../runtime/src/types';
import { getLoaders } from './request-event';

export function responseQData(requestEv: RequestEvent) {
  const requestHeaders: Record<string, string> = {};
  requestEv.request.headers.forEach((value, key) => (requestHeaders[key] = value));
  requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');

  const qData = getClientPageData(requestEv);
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

function getClientPageData(requestEv: RequestEvent) {
  const status = requestEv.status();
  const clientPage: ClientPageData = {
    loaders: getLoaders(requestEv),
    status: status !== 200 ? status : undefined,
    redirect: (status >= 301 && status <= 308 && requestEv.headers.get('location')) || undefined,
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
