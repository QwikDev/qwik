import type { RouteNavigate } from './types';

export const clientNavigate = (win: ClientHistoryWindow, routeNavigate: RouteNavigate) => {
  if (normalizePath(win.location) !== routeNavigate.path) {
    // current browser url and route path are different
    // push the new route path to the history
    win.history.pushState('', '', routeNavigate.path);
  }

  if (!win[CLIENT_HISTORY_INITIALIZED]) {
    // only add event listener once
    win[CLIENT_HISTORY_INITIALIZED] = 1;

    win.addEventListener('popstate', () => {
      // history pop event has happened
      const currentPath = normalizePath(win.location);

      if (currentPath !== routeNavigate.path) {
        // current browser url and route path are different
        // update the route path
        routeNavigate.path = currentPath;
      }
    });
  }
};

export const normalizePath = (url: URL | Location) => url.pathname + url.search + url.hash;

export const getClientNavigatePath = (href: string | undefined | null) => {
  if (typeof href === 'string') {
    try {
      const url = new URL(href, location.href);
      if (url.origin === origin) {
        return normalizePath(url);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return null;
};

const CLIENT_HISTORY_INITIALIZED = /* @__PURE__ */ Symbol();

interface ClientHistoryWindow extends Window {
  [CLIENT_HISTORY_INITIALIZED]?: 1;
}
