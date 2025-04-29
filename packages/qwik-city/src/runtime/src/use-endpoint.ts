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
    isPrefetch?: boolean;
  }
) => {
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, opts?.action);
  let qData: Promise<ClientPageData | undefined> | undefined;
  if (!opts?.action) {
    qData = CLIENT_DATA_CACHE.get(clientDataPath);
  }

  if (opts?.prefetchSymbols !== false) {
    prefetchSymbols(pagePathname);
  }
  let resolveFn: () => void | undefined;

  if (!qData) {
    const fetchOptions = getFetchOptions(opts?.action, opts?.clearCache);
    if (opts?.action) {
      opts.action.data = undefined;
    }
    qData = fetch(clientDataPath, fetchOptions).then((rsp) => {
      if (rsp.redirected) {
        const redirectedURL = new URL(rsp.url);
        const isQData = redirectedURL.pathname.endsWith('/q-data.json');
        if (!isQData || redirectedURL.origin !== location.origin) {
          // Captive portal etc. We can't talk to the server, so redirect as asked
          location.href = redirectedURL.href;
          return;
        }
      }
      if ((rsp.headers.get('content-type') || '').includes('json')) {
        // we are safe we are reading a q-data.json
        return rsp.text().then((text) => {
          const clientData = _deserializeData(text, element) as ClientPageData | null;
          if (!clientData) {
            // Something went wrong, show to the user
            location.href = url.href;
            return;
          }
          if (opts?.clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (clientData.redirect) {
            // server function asked for redirect
            location.href = clientData.redirect;
          } else if (opts?.action) {
            const { action } = opts;
            const actionData = clientData.loaders[action.id];
            resolveFn = () => {
              action!.resolve!({ status: rsp.status, result: actionData });
            };
          }
          return clientData;
        });
      } else {
        if (opts?.isPrefetch !== true) {
          location.href = url.href;
        }
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
    resolveFn && resolveFn();
    return v;
  });
};

const getFetchOptions = (
  action: RouteActionValue | undefined,
  noCache: boolean | undefined
): RequestInit | undefined => {
  const actionData = action?.data;
  if (!actionData) {
    if (noCache) {
      return {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      };
    }
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
