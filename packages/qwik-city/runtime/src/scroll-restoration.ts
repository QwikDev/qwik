import { $, type QRL } from '@builder.io/qwik';
import type { RestoreScroll, ScrollState } from './types';
import { isSamePath } from './utils';

/**
 * @alpha
 */
export const toTopAlways: QRL<RestoreScroll> = $((_type, fromUrl, toUrl) => () => {
  if (!scrollForHashChange(fromUrl, toUrl)) {
    window.scrollTo(0, 0);
  }
});

/**
 * @alpha
 */
export const toLastPositionOnPopState: QRL<RestoreScroll> = $(
  (type, fromUrl, toUrl, scrollState) => () => {
    // Chromium & Firefox will always natively restore on popstate, only scroll to hash on regular navigate.
    if (type === 'popstate' || !scrollForHashChange(fromUrl, toUrl)) {
      let [scrollX, scrollY] = [0, 0];
      if (type === 'popstate' && scrollState) {
        scrollX = scrollState.scrollX;
        scrollY = scrollState.scrollY;
      }
      window.scrollTo(scrollX, scrollY);
    }
  }
);

const scrollForHashChange = (fromUrl: URL, toUrl: URL): boolean => {
  const newHash = toUrl.hash;
  if (isSamePath(fromUrl, toUrl)) {
    // same route after path change
    if (fromUrl.hash !== newHash) {
      // hash has changed on the same route
      if (newHash) {
        // hash has changed on the same route and there's a hash
        // scroll to the element if it exists
        scrollToHashId(newHash);
      } else {
        // hash has changed on the same route, but now there's no hash
        window.scrollTo(0, 0);
      }
    }
  } else {
    // different route after change
    if (newHash) {
      scrollToHashId(newHash);
    } else {
      // different route and there isn't a hash
      return false;
    }
  }
  return true;
};

const scrollToHashId = (hash: string) => {
  const elmId = hash.slice(1);
  const elm = document.getElementById(elmId);
  if (elm) {
    // found element to scroll to
    elm.scrollIntoView();
  }
  return elm;
};

/**
 * @alpha
 */
export const currentScrollState = (elm: Element): ScrollState => {
  return {
    scrollX: elm.scrollLeft,
    scrollY: elm.scrollTop,
    scrollWidth: Math.max(elm.scrollWidth, elm.clientWidth),
    scrollHeight: Math.max(elm.scrollHeight, elm.clientHeight),
  };
};

/**
 * @alpha
 */
export const getScrollHistory = () => {
  const state = history.state as ScrollHistoryState;
  return state?._qCityScroll;
};

/**
 * @alpha
 */
export const saveScrollHistory = (scrollState: ScrollState, initialize = false) => {
  const state: ScrollHistoryState = history.state || {};

  if (state?._qCityScroll || initialize) {
    state._qCityScroll = scrollState;
    history.replaceState(state, '');
  }
};

/**
 * @alpha
 */
export interface ScrollHistoryState {
  _qCityScroll?: ScrollState;
}
