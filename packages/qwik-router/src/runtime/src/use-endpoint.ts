import { getClientDataPath } from './utils';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';
import { _deserialize } from '@qwik.dev/core/internal';
import { preloadRouteBundles } from './client-navigate';

const MAX_Q_DATA_RETRY_COUNT = 3;

export const loadClientData = async (
  url: URL,
  element: unknown,
  opts?: {
    action?: RouteActionValue;
    loaderIds?: string[];
    clearCache?: boolean;
    preloadRouteBundles?: boolean;
    isPrefetch?: boolean;
  },
  retryCount: number = 0
): Promise<ClientPageData | undefined> => {
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, {
    actionId: opts?.action?.id,
    loaderIds: opts?.loaderIds,
  });
  let qData: Promise<ClientPageData | undefined> | undefined;
  if (!opts?.action) {
    qData = CLIENT_DATA_CACHE.get(clientDataPath);
  }

  if (opts?.preloadRouteBundles !== false) {
    preloadRouteBundles(pagePathname, 0.8);
  }
  let resolveFn: () => void | undefined;

  if (!qData) {
    const fetchOptions = getFetchOptions(opts?.action, opts?.clearCache);
    if (opts?.action) {
      opts.action.data = undefined;
    }
    qData = fetch(clientDataPath, fetchOptions).then((rsp) => {
      if (rsp.status === 404 && opts?.loaderIds && retryCount < MAX_Q_DATA_RETRY_COUNT) {
        // retry if the q-data.json is not found with all options
        // we want to retry with all the loaders
        opts.loaderIds = undefined;
        return loadClientData(url, element, opts, retryCount + 1);
      }
      if (rsp.redirected) {
        const redirectedURL = new URL(rsp.url);
        const isQData = redirectedURL.pathname.endsWith('/q-data.json');
        if (!isQData || redirectedURL.origin !== location.origin) {
          // Captive portal etc. We can't talk to the server, so redirect as asked, except when prefetching
          if (!opts?.isPrefetch) {
            location.href = redirectedURL.href;
          }
          return;
        }
      }
      if ((rsp.headers.get('content-type') || '').includes('json')) {
        // we are safe we are reading a q-data.json
        return rsp.text().then((text) => {
          const [clientData] = _deserialize(text, element) as [ClientPageData];
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
        'Content-Type': 'application/json; charset=UTF-8',
      },
    };
  }
};
