import type { QwikCityEnvData } from '../../runtime/src/types';
import {
  getRequestLoaders,
  getRequestRoute,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
} from './request-event';
import type { RequestEvent } from './types';

export function getQwikCityServerData(requestEv: RequestEvent) {
  const { url, params, request, status, locale } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(RequestEvSharedActionId) as string;
  const formData = requestEv.sharedMap.get(RequestEvSharedActionFormData);
  const nonce = requestEv.sharedMap.get(RequestEvSharedNonce);

  return {
    url: new URL(url.pathname + url.search, url).href,
    requestHeaders,
    locale: locale(),
    nonce,
    qwikcity: {
      ev: requestEv,
      params: { ...params },
      loadedRoute: getRequestRoute(requestEv),
      response: {
        status: status(),
        loaders: getRequestLoaders(requestEv),
        action,
        formData,
      },
    } satisfies QwikCityEnvData,
  };
}
