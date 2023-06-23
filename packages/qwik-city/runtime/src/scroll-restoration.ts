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
    // Chromium & Firefox will always natively restore on visited popstates.
    // Always scroll to known state if available on pop. Otherwise, try hash scroll.
    if ((type === 'popstate' && scrollState) || !scrollForHashChange(fromUrl, toUrl)) {
      let [scrollX, scrollY] = [0, 0];
      if (scrollState) {
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

export const scrollToHashId = (hash: string) => {
  const elmId = hash.slice(1);
  const elm = document.getElementById(elmId);
  if (elm) {
    // found element to scroll to
    elm.scrollIntoView();
  }
  return elm;
};

export const currentScrollState = (elm: Element): ScrollState => {
  return {
    scrollX: elm.scrollLeft,
    scrollY: elm.scrollTop,
    scrollWidth: Math.max(elm.scrollWidth, elm.clientWidth),
    scrollHeight: Math.max(elm.scrollHeight, elm.clientHeight),
  };
};

export const getScrollHistory = () => {
  const state = history.state as ScrollHistoryState;
  return state?._qCityScroll;
};

export const saveScrollHistory = (scrollState: ScrollState) => {
  const state: ScrollHistoryState = history.state || {};
  state._qCityScroll = scrollState;
  history.replaceState(state, '');
};

export interface ScrollHistoryState {
  _qCityScroll?: ScrollState;
}
