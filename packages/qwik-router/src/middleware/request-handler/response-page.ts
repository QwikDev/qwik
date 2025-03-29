import { SerializerSymbol } from '@qwik.dev/core';
import { _UNINITIALIZED } from '@qwik.dev/core/internal';
import type { QwikRouterEnvData } from '../../runtime/src/types';
import {
  getRequestLoaders,
  getRequestRoute,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event';
import type { RequestEvent } from './types';
import { Q_ROUTE } from '../../runtime/src/constants';

export function getQwikRouterServerData(requestEv: RequestEvent) {
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

  const loaders = getRequestLoaders(requestEv);

  // shallow serialize loaders data
  (loaders as any)[SerializerSymbol] = (loaders: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const key in loaders) {
      const loader = loaders[key];
      if (typeof loader === 'object' && loader !== null) {
        (loader as any)[SerializerSymbol] = () => _UNINITIALIZED;
      }
      result[key] = _UNINITIALIZED;
    }
    return result;
  };

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
        action,
        formData,
      },
    } satisfies QwikRouterEnvData,
  };
}
