import type { QwikRouterEnvData } from '../../runtime/src/types';
import { getRouteLoaderCtx, getRouteLoaderValues } from '../../runtime/src/route-loaders';
import type { RequestEvent } from './types';

interface ResponsePageDeps {
  Q_ROUTE: string;
  RequestEvHttpStatusMessage: string;
  RequestEvSharedActionFormData: string;
  RequestEvSharedActionId: string;
  RequestEvSharedNonce: string;
  RequestRouteName: string;
  getRequestRoute: typeof import('./request-event-core').getRequestRoute;
}

export function getQwikRouterServerDataWithDeps(deps: ResponsePageDeps, requestEv: RequestEvent) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(deps.RequestEvSharedActionId) as string;
  const actionResult = requestEv.sharedMap.get('@actionResult');
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

  const routeLoaderCtx = getRouteLoaderCtx(requestEv);
  const loaderValues = getRouteLoaderValues(requestEv);

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
      routeLoaderCtx,
      loaderValues,
      response: {
        status: status(),
        statusMessage: requestEv.sharedMap.get(deps.RequestEvHttpStatusMessage) as
          | string
          | undefined,
        action,
        actionResult,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
