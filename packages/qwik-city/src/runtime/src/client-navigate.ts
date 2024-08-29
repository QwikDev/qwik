import { isBrowser } from '@builder.io/qwik/build';
import type { NavigationType, ScrollState } from './types';
import { isSamePath, toPath } from './utils';
import { PREFETCHED_NAVIGATE_PATHS } from './constants';

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

export const prefetchSymbols = (path: string) => {
  if (isBrowser) {
    path = path.endsWith('/') ? path : path + '/';
    if (!PREFETCHED_NAVIGATE_PATHS.has(path)) {
      PREFETCHED_NAVIGATE_PATHS.add(path);
      document.dispatchEvent(new CustomEvent('qprefetch', { detail: { links: [path] } }));
    }
  }
};
