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

/** Client-controlled forwarded headers only override the URL when the proxy is trusted. */
export function getServerDataUrl(
  originalUrl: URL,
  headers: Headers,
  trustForwardedHeaders: boolean
): string {
  const url = new URL(originalUrl.pathname + originalUrl.search, originalUrl);
  if (!trustForwardedHeaders) {
    return url.href;
  }
  const host = headers.get('X-Forwarded-Host');
  const protocol = headers.get('X-Forwarded-Proto');
  if (host) {
    url.port = '';
    url.host = host;
  }
  if (protocol) {
    url.protocol = protocol;
  }
  return url.href;
}

export function getQwikCityServerData(requestEv: RequestEvent, trustForwardedHeaders: boolean) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(RequestEvSharedActionId) as string;
  const formData = requestEv.sharedMap.get(RequestEvSharedActionFormData);
  const routeName = requestEv.sharedMap.get(RequestRouteName) as string;
  const nonce = requestEv.sharedMap.get(RequestEvSharedNonce);

  return {
    url: getServerDataUrl(originalUrl, request.headers, trustForwardedHeaders),
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
