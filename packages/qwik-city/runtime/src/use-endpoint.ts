import { getClientDataPath } from './utils';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';
import { _deserializeData } from '@builder.io/qwik';
import { prefetchSymbols } from './client-navigate';

export const loadClientData = async (
  url: URL,
  element: unknown,
  opts?: {
    action?: RouteActionValue;
    clearCache?: boolean;
    prefetchSymbols?: boolean;
  }
) => {
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, opts?.action);
  let qData = undefined;
  if (!opts?.action) {
    qData = CLIENT_DATA_CACHE.get(clientDataPath);
  }

  if (opts?.prefetchSymbols !== false) {
    prefetchSymbols(pagePathname);
  }

  if (!qData) {
    const fetchOptions = getFetchOptions(opts?.action);
    if (opts?.action) {
      opts.action.data = undefined;
    }
    qData = fetch(clientDataPath, fetchOptions).then((rsp) => {
      const redirectedURL = new URL(rsp.url);
      const isQData = redirectedURL.pathname.endsWith('/q-data.json');
      if (redirectedURL.origin !== location.origin || !isQData) {
        location.href = redirectedURL.href;
        return;
      }
      if ((rsp.headers.get('content-type') || '').includes('json')) {
        // we are safe we are reading a q-data.json
        return rsp.text().then((text) => {
          const clientData = _deserializeData(text, element) as ClientPageData | null;
          if (!clientData) {
            location.href = url.href;
            return;
          }
          if (opts?.clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (clientData.redirect) {
            location.href = clientData.redirect;
          } else if (opts?.action) {
            const actionData = clientData.loaders[opts.action.id];
            opts.action.resolve!({ status: rsp.status, result: actionData });
          }
          return clientData;
        });
      } else {
        location.href = url.href;
        return undefined;
      }
    });

    if (!opts?.action) {
      CLIENT_DATA_CACHE.set(clientDataPath, qData);
    }
  }

  return qData.then((v) => {
    if (!v) {
      CLIENT_DATA_CACHE.delete(clientDataPath);
    }
    return v;
  });
};

const getFetchOptions = (action: RouteActionValue | undefined): RequestInit | undefined => {
  const actionData = action?.data;
  if (!actionData) {
    return undefined;
  }
  if (actionData instanceof FormData) {
    return {
      method: 'POST',
      body: actionData,
    };
  } else {
    return {
      method: 'POST',
      body: JSON.stringify(actionData),
      headers: {
        'Content-Type': 'application/json, charset=UTF-8',
      },
    };
  }
};
