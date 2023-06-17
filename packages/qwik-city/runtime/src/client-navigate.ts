import { isBrowser } from '@builder.io/qwik/build';
import type { QPrefetchData } from './service-worker/types';
import type { NavigationType, ScrollState } from './types';
import { isSamePath, toPath } from './utils';

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
    scrollX: 0,
    scrollY: 0,
    scrollWidth: 0,
    scrollHeight: 0,
  };
};

export const dispatchPrefetchEvent = (prefetchData: QPrefetchData) => {
  if (isBrowser) {
    document.dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
  }
};
