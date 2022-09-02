import { useResource$ } from '@builder.io/qwik';
import { useLocation, useQwikCityEnv } from './use-functions';
import { isServer } from '@builder.io/qwik/build';
import type { ClientPageData, GetEndpointData } from './types';
import { getClientEndpointPath, toUrl } from './client-navigation';
import type { QPrefetchData } from './service-worker/types';
import { cacheModules } from '@qwik-city-plan';

/**
 * @alpha
 */
export const useEndpoint = <T = unknown>() => {
  const loc = useLocation();
  const env = useQwikCityEnv();

  return useResource$<GetEndpointData<T>>(async ({ track }) => {
    const pathname = track(loc, 'pathname');

    if (isServer) {
      if (!env) {
        throw new Error('Endpoint response body is missing');
      }
      return env.response.body;
    } else {
      // fetch() for new data when the pathname has changed
      const clientData = await loadClientData(pathname, loc);
      return clientData && clientData.body;
    }
  });
};

export const loadClientData = async (
  requestPathname: string,
  currentUrl: { pathname: string; href: string }
) => {
  const requestUrl = toUrl(requestPathname, currentUrl);
  const endpointUrl = getClientEndpointPath(requestUrl);
  const now = Date.now();
  const expiration = cacheModules ? 600000 : 15000;

  const cachedClientPageIndex = cachedClientPages.findIndex((c) => c.u === endpointUrl);
  let cachedClientPageData = cachedClientPages[cachedClientPageIndex];

  if (!cachedClientPageData || cachedClientPageData.t + expiration < now) {
    cachedClientPageData = {
      u: endpointUrl,
      t: now,
      c: new Promise<ClientPageData | null>((resolve) => {
        fetch(endpointUrl).then(
          (clientResponse) => {
            const contentType = clientResponse.headers.get('content-type') || '';
            if (clientResponse.ok && contentType.includes('json')) {
              clientResponse.json().then(
                (clientData: ClientPageData) => {
                  const prefetchData: QPrefetchData = {
                    bundles: clientData.prefetch,
                    qKeys: getDocumentQKeys(document),
                  };
                  dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
                  resolve(clientData);
                },
                () => resolve(null)
              );
            } else {
              resolve(null);
            }
          },
          () => resolve(null)
        );
      }),
    };

    for (let i = cachedClientPages.length - 1; i >= 0; i--) {
      if (cachedClientPages[i].t + expiration < now) {
        cachedClientPages.splice(i, 1);
      }
    }
    cachedClientPages.push(cachedClientPageData);
  }

  return cachedClientPageData.c;
};

export const getDocumentQKeys = (doc: Document) => {
  let comment: Comment | null | undefined;
  let data: string;
  let attrIndex: number;

  const walker = doc.createTreeWalker(doc, /* SHOW_COMMENT */ 128);
  const qKeys = new Set<string>();

  while ((comment = walker.nextNode() as any)) {
    data = comment.data;
    attrIndex = data.indexOf('q:key=');
    if (attrIndex > -1) {
      data = data.slice(attrIndex + 6);
      qKeys.add(data.slice(0, data.indexOf(':')));
    }
  }

  return Array.from(qKeys);
};

const cachedClientPages: CachedClientPageData[] = [];

interface CachedClientPageData {
  c: Promise<ClientPageData | null>;
  t: number;
  u: string;
}
