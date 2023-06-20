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
  const samePath = isSamePath(fromURL, toURL);
  const sameHash = fromURL.hash === toURL.hash;

  const newState = {
    _qCityScroll: newScrollState(),
  };

  if (navType === 'popstate') {
    if (samePath && toURL.hash && !sameHash && !history.state?._qCityScroll) {
      // This is an anchor tag, upgrade state to include scroll.
      const state = history.state || {};
      state._qCityScroll = newState;
      win.history.replaceState(state, '', toPath(toURL));
    }
  } else {
    if (!samePath || !sameHash) {
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
