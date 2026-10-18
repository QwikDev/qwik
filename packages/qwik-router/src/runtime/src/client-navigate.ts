import { isBrowser } from '@qwik.dev/core';
import { _requestPreload as preload } from '@qwik.dev/core/internal';
import { ensureSlash } from '../../utils/pathname';
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

    // TODO Refactor, some of this is redundant now.

    if (!samePath || !sameHash) {
      const newState = {
        _qRouterScroll: newScrollState(),
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

export const preloadRouteBundles = (routeName: string, probability: number = 0.8) => {
  if (isBrowser) {
    routeName = ensureSlash(routeName);
    routeName = routeName.length > 1 && routeName.startsWith('/') ? routeName.slice(1) : routeName;
    preload(routeName, probability);
  }
};
