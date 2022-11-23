import type { QPrefetchData } from './service-worker/types';
import type { RouteNavigate, SimpleURL } from './types';
import { CLIENT_HISTORY_INITIALIZED, POPSTATE_FALLBACK_INITIALIZED } from './constants';
import { isSameOriginDifferentPathname, isSamePath, toPath, toUrl } from './utils';

export const clientNavigate = (win: ClientHistoryWindow, routeNavigate: RouteNavigate) => {
  const currentUrl = win.location;
  const newUrl = toUrl(routeNavigate.path, currentUrl)!;

  if (isSameOriginDifferentPathname(currentUrl, newUrl)) {
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

      if (isSameOriginDifferentPathname(currentUrl, previousUrl)) {
        handleScroll(win, previousUrl, currentUrl);
        // current browser url and route path are different
        // update the route path
        routeNavigate.path = toPath(currentUrl);
      }
    });

    win.removeEventListener('popstate', win[POPSTATE_FALLBACK_INITIALIZED]!);
  }
};

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
    } else {
      // different route and there isn't a hash
      await domWait();
      win.scrollTo(0, 0);
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

export const dispatchPrefetchEvent = (prefetchData: QPrefetchData) => {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
  }
};

export interface ClientHistoryWindow extends Window {
  [CLIENT_HISTORY_INITIALIZED]?: 1;
  [POPSTATE_FALLBACK_INITIALIZED]?: () => void;
}
