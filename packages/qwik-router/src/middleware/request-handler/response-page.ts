import { Q_ROUTE } from '../../runtime/src/constants';
import type { QwikRouterEnvData } from '../../runtime/src/types';
import { getRouteLoaderCtx, getRouteLoaderValues } from '../../runtime/src/route-loaders';
import {
  getRequestMode,
  getRequestRoute,
  RequestEvHttpStatusMessage,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event-core';
import type { RequestEvent } from './types';

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

export function getQwikRouterServerData(requestEv: RequestEvent, trustForwardedHeaders: boolean) {
  const { params, request, status, locale, originalUrl } = requestEv;
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (requestHeaders[key] = value));

  const action = requestEv.sharedMap.get(RequestEvSharedActionId) as string;
  const actionResult = requestEv.sharedMap.get('@actionResult');
  const formData = requestEv.sharedMap.get(RequestEvSharedActionFormData);
  const routeName = requestEv.sharedMap.get(RequestRouteName) as string;
  const nonce = requestEv.sharedMap.get(RequestEvSharedNonce);

  const routeLoaderCtx = getRouteLoaderCtx(requestEv);
  const loaderValues = getRouteLoaderValues(requestEv);

  return {
    url: getServerDataUrl(originalUrl, request.headers, trustForwardedHeaders),
    requestHeaders,
    renderMode: getRequestMode(requestEv),
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
      routeLoaderCtx,
      loaderValues,
      response: {
        status: status(),
        statusMessage: requestEv.sharedMap.get(RequestEvHttpStatusMessage) as string | undefined,
        action,
        actionResult,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
