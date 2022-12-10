import { getClientDataPath } from './utils';
import { dispatchPrefetchEvent } from './client-navigate';
import { CLIENT_DATA_CACHE } from './constants';

export const loadClientData = async (href: string, clearCache?: boolean) => {
  const url = new URL(href);
  const pagePathname = url.pathname;
  const pageSearch = url.search;
  const clientDataPath = getClientDataPath(pagePathname, pageSearch);
  let qData = CLIENT_DATA_CACHE.get(clientDataPath);

  dispatchPrefetchEvent({
    links: [pagePathname],
  });

  if (!qData) {
    qData = fetch(clientDataPath).then((rsp) => {
      if (rsp.ok && (rsp.headers.get('content-type') || '').includes('json')) {
        return rsp.json().then((clientData) => {
          dispatchPrefetchEvent({
            bundles: clientData.prefetch,
          });
          if (clearCache) {
            CLIENT_DATA_CACHE.delete(clientDataPath);
          }
          return clientData;
        });
      } else {
        CLIENT_DATA_CACHE.delete(clientDataPath);
      }
    });

    CLIENT_DATA_CACHE.set(clientDataPath, qData);
  }

  return qData;
};
