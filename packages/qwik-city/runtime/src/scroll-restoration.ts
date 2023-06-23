import type { NavigationType, ScrollState } from './types';
import { isSamePath } from './utils';

export const restoreScroll = (
  type: NavigationType,
  fromUrl: URL,
  toUrl: URL,
  scrollState?: ScrollState
) => {
  // Chromium & Firefox will always natively restore on visited popstates.
  // Always scroll to known state if available on pop. Otherwise, try hash scroll.
  if ((type === 'popstate' && scrollState) || !scrollForHashChange(fromUrl, toUrl)) {
    let [x, y] = [0, 0];
    if (scrollState) {
      x = scrollState.x;
      y = scrollState.y;
    }
    window.scrollTo(x, y);
  }
};

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
    x: elm.scrollLeft,
    y: elm.scrollTop,
    w: Math.max(elm.scrollWidth, elm.clientWidth),
    h: Math.max(elm.scrollHeight, elm.clientHeight),
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
