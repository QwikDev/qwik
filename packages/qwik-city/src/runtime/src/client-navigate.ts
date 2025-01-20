import { isBrowser } from '@builder.io/qwik';
import { PREFETCHED_NAVIGATE_PATHS } from './constants';
import type { NavigationType, ScrollState } from './types';
import { isSamePath, toPath } from './utils';

declare global {
  interface Window {
    qwikPrefetchSW?: any[][];
  }
}

export const clientNavigate = (
  win: Window,
  navType: NavigationType,
  fromURL: URL,
  toURL: URL,
  replaceState = false
) => {
  if (navType !== 'popstate') {
    const samePath = isSamePath(fromURL, toURL);
    const sameHash = fromURL.hash === toURL.hash;

    // TODO Refactor, some of this is redundant now.

    if (!samePath || !sameHash) {
      const newState = {
        _qCityScroll: newScrollState(),
      };

      if (replaceState) {
        win.history.replaceState(newState, '', toPath(toURL));
      } else {
        // push to history for path or hash changes
        win.history.pushState(newState, '', toPath(toURL));
      }
    }
  }
};

export const newScrollState = (): ScrollState => {
  return {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
};

export const prefetchSymbols = (path: string, base?: string) => {
  if (isBrowser) {
    // Ensure path has trailing slash for backwards compatibility with qprefetch event
    const pathWithSlash = path.endsWith('/') ? path : path + '/';
    if (!PREFETCHED_NAVIGATE_PATHS.has(pathWithSlash)) {
      PREFETCHED_NAVIGATE_PATHS.add(pathWithSlash);

      // Get the base from container attributes if not provided
      const containerBase = base ?? document.documentElement.getAttribute('q:base') ?? '/';
      (window.qwikPrefetchSW || (window.qwikPrefetchSW = [])).push([
        'link-prefetch',
        containerBase,
        pathWithSlash,
      ]);

      // Keep the existing event for backwards compatibility
      document.dispatchEvent(new CustomEvent('qprefetch', { detail: { links: [pathWithSlash] } }));
    }
  }
};
