import type { RouteActionValue, SimpleURL } from './types';

import type { LinkProps } from './link-component';
import { QACTION_KEY } from './constants';

/**
 * Gets an absolute url path string (url.pathname + url.search + url.hash)
 */
export const toPath = (url: URL) => url.pathname + url.search + url.hash;

/**
 * Create a URL from a string and baseUrl
 */
export const toUrl = (url: string, baseUrl: SimpleURL) => new URL(url, baseUrl.href);

/**
 * Checks only if the origins are the same.
 */
export const isSameOrigin = (a: SimpleURL, b: SimpleURL) => a.origin === b.origin;

/**
 * Checks only if the pathname + search are the same for the URLs.
 */
export const isSamePath = (a: SimpleURL, b: SimpleURL) =>
  a.pathname + a.search === b.pathname + b.search;

/**
 * Checks only if the pathnames are the same for the URLs (doesn't include search and hash)
 */
export const isSamePathname = (a: SimpleURL, b: SimpleURL) => a.pathname === b.pathname;

/**
 * Checks only if the search query strings are the same for the URLs
 */
export const isSameSearchQuery = (a: SimpleURL, b: SimpleURL) => a.search === b.search;

/**
 * Same origin, but different pathname (doesn't include search and hash)
 */
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

export const getPrefetchDataset = (
  props: LinkProps,
  clientNavPath: string | null,
  currentLoc: { url: URL }
) => {
  if (props.prefetch === true && clientNavPath) {
    const prefetchUrl = toUrl(clientNavPath, currentLoc.url);
    const currentUrl = toUrl('', currentLoc.url);
    if (!isSamePathname(prefetchUrl, currentUrl) || !isSameSearchQuery(prefetchUrl, currentUrl)) {
      return '';
    }
  }
  return null;
};

export const isPromise = (value: any): value is Promise<any> => {
  // not using "value instanceof Promise" to have zone.js support
  return value && typeof value.then === 'function';
};
