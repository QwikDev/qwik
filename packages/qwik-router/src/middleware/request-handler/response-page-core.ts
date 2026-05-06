import type { QwikRouterEnvData } from '../../runtime/src/types';
import type { RequestEvent } from './types';

interface ResponsePageDeps {
  Q_ROUTE: string;
  RequestEvHttpStatusMessage: string;
  RequestEvSharedActionFormData: string;
  RequestEvSharedActionId: string;
  RequestEvSharedNonce: string;
  RequestRouteName: string;
  getRequestLoaders: typeof import('./request-event-core').getRequestLoaders;
  getRequestLoaderSerializationStrategyMap: typeof import('./request-event-core').getRequestLoaderSerializationStrategyMap;
  getRequestRoute: typeof import('./request-event-core').getRequestRoute;
}

export function getQwikRouterServerDataWithDeps(deps: ResponsePageDeps, requestEv: RequestEvent) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(deps.RequestEvSharedActionId) as string;
  const formData = requestEv.sharedMap.get(deps.RequestEvSharedActionFormData);
  const routeName = requestEv.sharedMap.get(deps.RequestRouteName) as string;
  const nonce = requestEv.sharedMap.get(deps.RequestEvSharedNonce);
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

  const loaders = deps.getRequestLoaders(requestEv);
  const loadersSerializationStrategy = deps.getRequestLoaderSerializationStrategyMap(requestEv);

  return {
    url: reconstructedUrl.href,
    requestHeaders,
    locale: locale(),
    nonce,
    containerAttributes: {
      [deps.Q_ROUTE]: routeName,
    },
    qwikrouter: {
      routeName,
      ev: requestEv,
      params: { ...params },
      loadedRoute: deps.getRequestRoute(requestEv),
      response: {
        status: status(),
        statusMessage: requestEv.sharedMap.get(deps.RequestEvHttpStatusMessage) as
          | string
          | undefined,
        loaders,
        loadersSerializationStrategy,
        action,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
