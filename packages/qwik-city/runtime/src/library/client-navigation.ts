import type { RouteNavigate } from './types';

export const clientNavigate = (win: ClientHistoryWindow, routeNavigate: RouteNavigate) => {
  const currentUrl = win.location;
  const newUrl = toUrl(routeNavigate.path, currentUrl)!;

  if (isSameOriginDifferentPath(currentUrl, newUrl)) {
    // current browser url and route path are different
    // see if we should scroll to the hash after the url update
    handleScroll(win, currentUrl, newUrl);

    // push the new route path to the history
    win.history.pushState('', '', toPath(newUrl));
  }

  if (!win[CLIENT_HISTORY_INITIALIZED]) {
    // only add event listener once
    win[CLIENT_HISTORY_INITIALIZED] = 1;

    win.addEventListener('popstate', () => {
      // history pop event has happened
      const currentUrl = win.location;
      const previousUrl = toUrl(routeNavigate.path, currentUrl)!;

      if (isSameOriginDifferentPath(currentUrl, previousUrl)) {
        handleScroll(win, previousUrl, currentUrl);
        // current browser url and route path are different
        // update the route path
        routeNavigate.path = toPath(currentUrl);
      }
    });
  }
};

/**
 * Gets an absolute url path string (url.pathname + url.search + url.hash)
 */
export const toPath = (url: SimpleURL) => url.pathname + url.search + url.hash;

/**
 * Create a URL from a string and baseUrl
 */
const toUrl = (url: string, baseUrl: { href: string }) => new URL(url, baseUrl.href);

/**
 * Checks only if the origins are the same.
 */
const isSameOrigin = (a: SimpleURL, b: SimpleURL) => a.origin === b.origin;

/**
 * Checks only if the pathname + search are the same for the URLs.
 */
const isSamePath = (a: SimpleURL, b: SimpleURL) => toPath(a) === toPath(b);

/**
 * Same origin, but different pathname + search + hash.
 */
export const isSameOriginDifferentPath = (a: SimpleURL, b: SimpleURL) =>
  isSameOrigin(a, b) && !isSamePath(a, b);

export const getClientNavPath = (props: Record<string, any>, baseUrl: { href: string }) => {
  const href = props.href;
  if (typeof href === 'string' && href.trim() !== '' && typeof props.target !== 'string') {
    try {
      const linkUrl = toUrl(href, baseUrl);
      const currentUrl = toUrl('', baseUrl)!;
      if (isSameOrigin(linkUrl, currentUrl)) {
        return toPath(linkUrl);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return null;
};

export const getClientEndpointPath = (pagePathname: string, buildId: string) =>
  pagePathname + (pagePathname.endsWith('/') ? '' : '/') + 'qdata.json?v=' + buildId;

const handleScroll = async (win: Window, previousUrl: SimpleURL, newUrl: SimpleURL) => {
  const doc = win.document;
  const newHash = newUrl.hash;

  if (isSamePath(previousUrl, newUrl)) {
    // same route after path change

    if (previousUrl.hash !== newHash) {
      // hash has changed on the same route

      // wait for a moment while window gets settled
      await domWait();

      if (newHash) {
        // hash has changed on the same route and there's a hash
        // scroll to the element if it exists
        scrollToHashId(doc, newHash);
      } else {
        // hash has changed on the same route, but now there's no hash
        win.scrollTo(0, 0);
      }
    }
  } else {
    // different route after change

    if (newHash) {
      // different route and there's a hash
      // content may not have finished updating yet
      // poll the dom querying for the element for a short time
      for (let i = 0; i < 24; i++) {
        await domWait();
        if (scrollToHashId(doc, newHash)) {
          break;
        }
      }
    }
  }
};

const domWait = () => new Promise((resolve) => setTimeout(resolve, 12));

const scrollToHashId = (doc: Document, hash: string) => {
  const elmId = hash.slice(1);
  const elm = doc.getElementById(elmId);
  if (elm) {
    // found element to scroll to
    elm.scrollIntoView();
  }
  return elm;
};

export const CLIENT_HISTORY_INITIALIZED = /* @__PURE__ */ Symbol();

export interface ClientHistoryWindow extends Window {
  [CLIENT_HISTORY_INITIALIZED]?: 1;
}

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}
