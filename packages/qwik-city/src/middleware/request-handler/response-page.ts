import type { QwikCityEnvData } from '../../runtime/src/types';
import type { RequestEvent } from './types';
import {
  getRequestLoaders,
  getRequestRoute,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event';

export function getQwikCityServerData(requestEv: RequestEvent) {
  const { url, params, request, status, locale } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(RequestEvSharedActionId) as string;
  const formData = requestEv.sharedMap.get(RequestEvSharedActionFormData);
  const routeName = requestEv.sharedMap.get(RequestRouteName) as string;
  const nonce = requestEv.sharedMap.get(RequestEvSharedNonce);
  const headers = requestEv.request.headers;
  const reconstructedUrl = new URL(url.pathname + url.search, url);
  const host = headers.get('X-Forwarded-Host')!;
  const protocol = headers.get('X-Forwarded-Proto')!;
  if (host) {
    reconstructedUrl.port = '';
    reconstructedUrl.host = host;
  }
  if (protocol) {
    reconstructedUrl.protocol = protocol;
  }

  return {
    url: reconstructedUrl.href,
    requestHeaders,
    locale: locale(),
    nonce,
    containerAttributes: {
      'q:route': routeName,
    },
    qwikcity: {
      routeName,
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
