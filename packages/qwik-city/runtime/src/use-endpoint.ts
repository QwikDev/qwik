import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';
import type { ClientPageData, RouteActionValue } from './types';

export const loadClientData = async (
  href: string,
  clearCache?: boolean,
  action?: RouteActionValue
) => {
  const url = new URL(href);
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch, action);
  let qData = action ? undefined : CLIENT_DATA_CACHE.get(clientDataPath);

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  if (!qData) {
    const options: RequestInit | undefined = action
      ? {
          method: 'POST',
          body: action.data,
        }
      : undefined;
    qData = fetch(clientDataPath, options).then((rsp) => {
      if (rsp.ok && (rsp.headers.get('content-type') || '').includes('json')) {
        return rsp.json().then((clientData: ClientPageData) => {
          dispatchPrefetchEvent({
            bundles: clientData.prefetch,
          });
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          if (action) {
            const actionData = clientData.loaders[action.id];
            action.resolve(actionData);
          }
          return clientData;
        });
      } else {
        CLIENT_DATA_CACHE.delete(clientDataPath);
      }
    });

    if (!action) {
      CLIENT_DATA_CACHE.set(clientDataPath, qData);
    }
  }

  return qData;
};
