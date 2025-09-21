import { Q_ROUTE } from '../../runtime/src/constants';
import type { QwikRouterEnvData } from '../../runtime/src/types';
import {
  getRequestActions,
  getRequestLoaders,
  getRequestLoaderSerializationStrategyMap,
  getRequestRoute,
  RequestEvSharedActionFormData,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event';
import type { RequestEvent } from './types';
import { QActionId } from './user-response';

export function getQwikRouterServerData(requestEv: RequestEvent) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const actionId = requestEv.sharedMap.get(QActionId) as string | undefined;
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
  const actions = getRequestActions(requestEv);

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
        action: actionId
          ? {
              id: actionId,
              data: actions[actionId],
            }
          : undefined,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
