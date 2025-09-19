import type { ClientPageData, RouteActionValue } from './types';
import { _deserialize, _getDomContainer } from '@qwik.dev/core/internal';
import { preloadRouteBundles } from './client-navigate';
import type { QData } from '../../middleware/request-handler/qdata-endpoints';
import { QACTION_KEY } from './constants';

interface LoaderDataResponse {
  id: string;
  route: string;
}

export const loadClientLoaderData = async (url: URL, loaderId: string, manifestHash: string) => {
  const pagePathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  return fetchLoader(loaderId, pagePathname, manifestHash);
};

export const loadClientData = async (
  url: URL,
  manifestHash: string,
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
    preloadRouteBundles(pagePathname);
  }

  const loaders: Record<string, unknown> = {};
  let resolveFn: () => void | undefined;
  let actionData: unknown;
  if (opts?.action) {
    const actionResult = await fetchActionData(opts.action, pagePathname, url.searchParams);
    actionData = actionResult.data;
    resolveFn = () => {
      opts.action!.resolve!({ status: actionResult.status, result: actionData });
    };
  } else {
    let loaderData: LoaderDataResponse[] = [];
    if (!opts?.loaderIds) {
      // we need to load all the loaders
      // first we need to get the loader urls
      loaderData = (await fetchLoaderData(pagePathname, manifestHash)).loaderData;
    } else {
      loaderData = opts.loaderIds.map((loaderId) => {
        return {
          id: loaderId,
          route: pagePathname,
        };
      });
    }
    if (loaderData.length > 0) {
      // load specific loaders
      const loaderPromises = loaderData.map((loader) =>
        fetchLoader(loader.id, loader.route, manifestHash)
      );
      const loaderResults = await Promise.all(loaderPromises);
      for (let i = 0; i < loaderData.length; i++) {
        loaders[loaderData[i].id] = loaderResults[i];
      }
    }
  }

  const qDataUrl = `${pagePathname}q-data.json`;
  const qData = fetch(qDataUrl).then((rsp) => {
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
      action: actionData
        ? {
            id: opts!.action!.id,
            data: actionData,
          }
        : undefined,
      href: v?.href ?? pagePathname,
      status: v?.status ?? 200,
      isRewrite: v?.isRewrite ?? false,
    } satisfies ClientPageData;
  });
};

export async function fetchLoaderData(
  routePath: string,
  manifestHash: string
): Promise<{ loaderData: LoaderDataResponse[] }> {
  const url = `${routePath}q-loader-data.${manifestHash}.json`;
  const response = await fetch(url);
  return response.json();
}

export async function fetchLoader(
  loaderId: string,
  routePath: string,
  manifestHash: string
): Promise<unknown> {
  const url = `${routePath}q-loader-${loaderId}.${manifestHash}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${loaderId}: ${response.status}`);
  }

  const text = await response.text();
  const [data] = _deserialize(text, document.documentElement) as [Record<string, unknown>];

  return data;
}

function buildActionUrl(
  routePath: string,
  searchParams: URLSearchParams,
  actionId: string
): string {
  searchParams.set(QACTION_KEY, actionId);
  return `${routePath}?${searchParams.toString()}`;
}

export async function fetchActionData(
  action: RouteActionValue,
  routePath: string,
  searchParams: URLSearchParams
): Promise<{ data: unknown; status: number }> {
  const url = buildActionUrl(routePath, searchParams, action.id);
  const fetchOptions = getActionFetchOptions(action);
  // TODO: why we need it?
  action.data = undefined;
  const response = await fetch(url, fetchOptions);

  const text = await response.text();
  const [data] = _deserialize(text, document.documentElement) as [Record<string, unknown>];

  return { data, status: response.status };
}

const getActionFetchOptions = (action: RouteActionValue): RequestInit | undefined => {
  const actionData = action.data;
  if (actionData instanceof FormData) {
    return {
      method: 'POST',
      body: actionData,
      headers: {
        accept: 'application/json',
      },
    };
  } else {
    return {
      method: 'POST',
      body: JSON.stringify(actionData),
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
      },
    };
  }
};
