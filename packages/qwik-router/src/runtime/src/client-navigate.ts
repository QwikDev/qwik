import { isBrowser } from '@qwik.dev/core';
// @ts-expect-error we don't have types for the preloader yet
import { p as preload } from '@qwik.dev/core/preloader';
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

export const preloadRouteBundles = (path: string, probability: number = 0.8) => {
  if (isBrowser) {
    path = path.endsWith('/') ? path : path + '/';
    path = path.length > 1 && path.startsWith('/') ? path.slice(1) : path;
    preload(path, probability);
  }
};
