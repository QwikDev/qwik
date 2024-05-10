import type { NavigationType, ScrollState } from './types';
import { isSamePath } from './utils';

export const restoreScroll = (
  type: NavigationType,
  toUrl: URL,
  fromUrl: URL,
  scroller: Element,
  scrollState?: ScrollState
) => {
  if (type === 'popstate' && scrollState) {
    scroller.scrollTo(scrollState.x, scrollState.y);
  } else if (type === 'link' || type === 'form') {
    if (!hashScroll(toUrl, fromUrl)) {
      scroller.scrollTo(0, 0);
    }
  }
};

const hashScroll = (toUrl: URL, fromUrl: URL) => {
  const elmId = toUrl.hash.slice(1);
  // Firefox complains about empty ids.
  const elm = elmId && document.getElementById(elmId);

  if (elm) {
    elm.scrollIntoView();
    return true;
  } else if (!elm && toUrl.hash && isSamePath(toUrl, fromUrl)) {
    // Non-existent (but non-empty) hashes will not scroll in browsers.
    // However, cross-page non-existent hashes will scroll to top.
    return true;
  }

  return false;
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
