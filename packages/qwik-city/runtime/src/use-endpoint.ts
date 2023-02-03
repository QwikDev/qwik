import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';
import { _deserializeData } from '@builder.io/qwik';

export const loadClientData = async (
  href: string,
  clearCache?: boolean,
  action?: RouteActionValue
) => {
  const url = new URL(href);
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, action);
  let qData = undefined;
  if (!action) {
    qData = CLIENT_DATA_CACHE.get(clientDataPath);
  }

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  if (!qData) {
    const options = getFetchOptions(action);
    if (action) {
      action.data = undefined;
    }
    qData = fetch(clientDataPath, options).then((rsp) => {
      const redirectedURL = new URL(rsp.url);
      if (redirectedURL.origin !== location.origin || !isQDataJson(redirectedURL.pathname)) {
        location.href = redirectedURL.href;
        return;
      }
      if ((rsp.headers.get('content-type') || '').includes('json')) {
        // we are safe we are reading a q-data.json
        return rsp.text().then((text) => {
          const clientData = _deserializeData(text) as ClientPageData | null;
          if (!clientData) {
            location.href = href;
            return;
          }
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (clientData.redirect) {
            location.href = clientData.redirect;
          } else if (action) {
            const actionData = clientData.loaders[action.id];
            action.resolve!({ status: rsp.status, result: actionData });
          }
          return clientData;
        });
      } else {
        location.href = href;
        return undefined;
      }
    });

    if (!action) {
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

export const isQDataJson = (pathname: string) => {
  return pathname.endsWith(QDATA_JSON);
};

export const QDATA_JSON = '/q-data.json';
