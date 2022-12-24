import type { QwikCityEnvData } from '../../runtime/src/types';
import type { RequestEvent } from './types';
import { getRequestAction, getRequestLoaders } from './request-event';

export function getQwikCityEnvData(requestEv: RequestEvent<unknown>): {
  url: string;
  requestHeaders: Record<string, string>;
  locale: string | undefined;
  qwikcity: QwikCityEnvData;
} {
  const { url, params, request, status, locale } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  return {
    url: new URL(url.pathname + url.search, url).href,
    requestHeaders,
    locale: locale(),
    qwikcity: {
      // mode: getRequestMode(requestEv),
      params: { ...params },
      response: {
        status: status(),
        loaders: getRequestLoaders(requestEv),
        action: getRequestAction(requestEv),
      },
    },
  };
}
