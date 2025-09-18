import type { ClientPageData, RouteActionValue } from './types';
import { _deserialize } from '@qwik.dev/core/internal';
import { preloadRouteBundles } from './client-navigate';
import type { QData } from '../../middleware/request-handler/qdata-endpoints';

export const loadClientLoaderData = async (url: URL, loaderId: string) => {
  const pagePathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  return fetchLoader(loaderId, pagePathname);
};

export const loadClientData = async (
  url: URL,
  opts?: {
    action?: RouteActionValue;
    loaderIds?: string[];
    clearCache?: boolean;
    preloadRouteBundles?: boolean;
    isPrefetch?: boolean;
  }
): Promise<ClientPageData | undefined> => {
  const pagePathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  if (opts?.preloadRouteBundles !== false) {
    preloadRouteBundles(pagePathname, 0.8);
  }

  if (!opts?.loaderIds) {
    // we need to load all the loaders
    // first we need to get the loader ids
    opts = opts || {};
    opts.loaderIds = (await fetchLoaderData(pagePathname)).loaderIds;
  }

  const loaderIds = opts.loaderIds;
  const loaders: Record<string, unknown> = {};
  if (loaderIds.length > 0) {
    // load specific loaders
    const loaderPromises = loaderIds.map((loaderId) => fetchLoader(loaderId, pagePathname));
    const loaderResults = await Promise.all(loaderPromises);
    for (let i = 0; i < loaderIds.length; i++) {
      loaders[loaderIds[i]] = loaderResults[i];
    }
  }

  const fetchOptions = getFetchOptions(opts?.action, opts?.clearCache);
  if (opts?.action) {
    opts.action.data = undefined;
  }

  let resolveFn: () => void | undefined;
  const qDataUrl = `${pagePathname}q-data.json`;
  const qData = fetch(qDataUrl, fetchOptions).then((rsp) => {
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
        const [clientData] = _deserialize(text) as [QData];
        if (!clientData) {
          // Something went wrong, show to the user
          location.href = url.href;
          return;
        }
        if (clientData.redirect) {
          // server function asked for redirect
          location.href = clientData.redirect;
        } else if (opts?.action) {
          const { action } = opts;
          const actionData = loaders[action.id];
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
      return;
    }
  });

  return qData.then((v) => {
    resolveFn && resolveFn();
    return {
      loaders,
      href: v?.href,
      status: v?.status,
      action: v?.action,
      redirect: v?.redirect,
      isRewrite: v?.isRewrite,
    } as ClientPageData;
  });
};

export async function fetchLoaderData(routePath: string): Promise<{ loaderIds: string[] }> {
  const url = `${routePath}q-loader-data.json`;
  const response = await fetch(url);
  return response.json();
}

export async function fetchLoader(loaderId: string, routePath: string): Promise<unknown> {
  const url = `${routePath}q-loader-${loaderId}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${loaderId}: ${response.status}`);
  }

  const text = await response.text();
  const [data] = _deserialize(text, document.documentElement) as [Record<string, unknown>];

  return data;
}

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
