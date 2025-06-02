import type { RouteActionValue, SimpleURL } from './types';

import { QACTION_KEY } from './constants';

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
  action?: RouteActionValue
) => {
  let search = pageSearch ?? '';
  if (action) {
    search += (search ? '&' : '?') + QACTION_KEY + '=' + encodeURIComponent(action.id);
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
