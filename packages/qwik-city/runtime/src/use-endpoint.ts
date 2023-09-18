import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';
import { _deserializeData } from '@builder.io/qwik';

export const loadClientData = async (
  url: URL,
  element: unknown,
  clearCache?: boolean,
  action?: RouteActionValue
) => {
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
  let resolveFn: () => void | undefined;

  if (!qData) {
    const options = getFetchOptions(action);
    if (action) {
      action.data = undefined;
    }
    qData = fetch(clientDataPath, options).then((rsp) => {
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
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (clientData.redirect) {
            location.href = clientData.redirect;
          } else if (action) {
            const actionData = clientData.loaders[action.id];
            resolveFn = () => {
              action.resolve!({ status: rsp.status, result: actionData });
            };
          }
          return clientData;
        });
      } else {
        location.href = url.href;
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
    resolveFn && resolveFn();
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
