import { Q_ROUTE } from '../../runtime/src/constants';
import type { QwikRouterEnvData } from '../../runtime/src/types';
import {
  getRequestLoaders,
  getRequestLoaderSerializationStrategyMap,
  getRequestRoute,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event';
import type { RequestEvent } from './types';

export function getQwikRouterServerData(requestEv: RequestEvent) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(RequestEvSharedActionId) as string;
  const formData = requestEv.sharedMap.get(RequestEvSharedActionFormData);
  const routeName = requestEv.sharedMap.get(RequestRouteName) as string;
  const nonce = requestEv.sharedMap.get(RequestEvSharedNonce);
  const headers = requestEv.request.headers;
  const reconstructedUrl = new URL(originalUrl.pathname + originalUrl.search, originalUrl);
  const host = headers.get('X-Forwarded-Host')!;
  const protocol = headers.get('X-Forwarded-Proto')!;
  if (host) {
    reconstructedUrl.port = '';
    reconstructedUrl.host = host;
  }
  if (protocol) {
    reconstructedUrl.protocol = protocol;
  }

  const loaders = getRequestLoaders(requestEv);
  const loadersSerializationStrategy = getRequestLoaderSerializationStrategyMap(requestEv);

  return {
    url: reconstructedUrl.href,
    requestHeaders,
    locale: locale(),
    nonce,
    containerAttributes: {
      [Q_ROUTE]: routeName,
    },
    qwikrouter: {
      routeName,
      ev: requestEv,
      params: { ...params },
      loadedRoute: getRequestRoute(requestEv),
      response: {
        status: status(),
        loaders,
        loadersSerializationStrategy,
        action,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
