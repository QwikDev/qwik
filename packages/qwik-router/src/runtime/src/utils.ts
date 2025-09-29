import type { SimpleURL } from './types';

import { createAsyncComputed$, isBrowser } from '@qwik.dev/core';
import {
  _UNINITIALIZED,
  type ClientContainer,
  type SerializationStrategy,
} from '@qwik.dev/core/internal';
import { QACTION_KEY, QLOADER_KEY } from './constants';
import { loadClientData } from './use-endpoint';

/** Gets an absolute url path string (url.pathname + url.search + url.hash) */
export const toPath = (url: URL) => url.pathname + url.search + url.hash;

/** Create a URL from a string and baseUrl */
export const toUrl = (url: string | URL, baseUrl: SimpleURL) => new URL(url, baseUrl.href);

/** Checks only if the origins are the same. */
export const isSameOrigin = (a: SimpleURL, b: SimpleURL) => a.origin === b.origin;

const withSlash = (path: string) => (path.endsWith('/') ? path : path + '/');
/** Checks only if the pathnames are the same for the URLs (doesn't include search and hash) */
export const isSamePathname = ({ pathname: a }: SimpleURL, { pathname: b }: SimpleURL) => {
  const lDiff = Math.abs(a.length - b.length);
  return lDiff === 0 ? a === b : lDiff === 1 && withSlash(a) === withSlash(b);
};
/** Checks only if the search query strings are the same for the URLs */
export const isSameSearchQuery = (a: SimpleURL, b: SimpleURL) => a.search === b.search;

/** Checks only if the pathname + search are the same for the URLs. */
export const isSamePath = (a: SimpleURL, b: SimpleURL) =>
  isSameSearchQuery(a, b) && isSamePathname(a, b);

/** Same origin, but different pathname (doesn't include search and hash) */
export const isSameOriginDifferentPathname = (a: SimpleURL, b: SimpleURL) =>
  isSameOrigin(a, b) && !isSamePath(a, b);

export const getClientDataPath = (
  pathname: string,
  pageSearch?: string,
  options?: {
    actionId?: string;
    loaderIds?: string[];
  }
) => {
  let search = pageSearch ?? '';
  if (options?.actionId) {
    search += (search ? '&' : '?') + QACTION_KEY + '=' + encodeURIComponent(options.actionId);
  }
  if (options?.loaderIds) {
    for (const loaderId of options.loaderIds) {
      search += (search ? '&' : '?') + QLOADER_KEY + '=' + encodeURIComponent(loaderId);
    }
  }
  return pathname + (pathname.endsWith('/') ? '' : '/') + 'q-data.json' + search;
};

export const getClientNavPath = (props: Record<string, any>, baseUrl: { url: URL }) => {
  const href = props.href;
  if (typeof href === 'string' && typeof props.target !== 'string' && !props.reload) {
    try {
      const linkUrl = toUrl(href.trim(), baseUrl.url);
      const currentUrl = toUrl('', baseUrl.url)!;
      if (isSameOrigin(linkUrl, currentUrl)) {
        return toPath(linkUrl);
      }
    } catch (e) {
      console.error(e);
    }
  } else if (props.reload) {
    return toPath(toUrl('', baseUrl.url));
  }
  return null;
};

export const shouldPreload = (clientNavPath: string | null, currentLoc: { url: URL }) => {
  if (clientNavPath) {
    const prefetchUrl = toUrl(clientNavPath, currentLoc.url);
    const currentUrl = toUrl('', currentLoc.url);

    return !isSamePathname(prefetchUrl, currentUrl);
  }
  return false;
};

export const isPromise = (value: any): value is Promise<any> => {
  // not using "value instanceof Promise" to have zone.js support
  return value && typeof value.then === 'function';
};

export const createLoaderSignal = (
  loadersObject: Record<string, unknown>,
  loaderId: string,
  url: URL,
  serializationStrategy: SerializationStrategy,
  container?: ClientContainer
) => {
  return createAsyncComputed$(
    async () => {
      if (isBrowser && loadersObject[loaderId] === _UNINITIALIZED) {
        const data = await loadClientData(url, undefined, {
          loaderIds: [loaderId],
        });
        loadersObject[loaderId] = data?.loaders[loaderId] ?? _UNINITIALIZED;
      }
      return loadersObject[loaderId];
    },
    {
      container: container as ClientContainer,
      serializationStrategy,
    }
  );
};
