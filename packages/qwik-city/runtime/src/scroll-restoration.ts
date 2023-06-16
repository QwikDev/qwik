import { $, type QRL } from '@builder.io/qwik';
import type { RestoreScroll, ScrollRecord, ScrollState } from './types';
import { isSamePath } from './utils';
import { getHistoryId } from './client-navigate';

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
  (type, fromUrl, toUrl, scrollRecord) => () => {
    flushScrollRecordToStorage(scrollRecord);

    if (!scrollForHashChange(fromUrl, toUrl)) {
      // retrieve scroll position for popstate navigation
      let [scrollX, scrollY] = [0, 0];
      if (type === 'popstate') {
        const record = scrollRecord[getHistoryId()];
        if (record) {
          scrollX = record[0];
          scrollY = record[1];
        }
      }
      window.scrollTo(scrollX, scrollY);
    }
  }
);

const QWIK_CITY_SCROLL_RECORD = '_qCityScroll';

export const currentScrollState = (elm: Element): ScrollState => [
  window.scrollX,
  window.scrollY,
  Math.max(elm.scrollWidth, elm.clientWidth),
  Math.max(elm.scrollHeight, elm.clientHeight),
];

const flushScrollRecordToStorage = (scrollRecord: ScrollRecord) => {
  try {
    sessionStorage.setItem(QWIK_CITY_SCROLL_RECORD, JSON.stringify(scrollRecord));
  } catch (e) {
    console.error('Failed to save scroll positions', e);
  }
};

export const getOrInitializeScrollRecord = (): ScrollRecord => {
  const win = window as ScrollHistoryWindow;
  if (win[QWIK_CITY_SCROLL_RECORD]) {
    return win[QWIK_CITY_SCROLL_RECORD];
  }
  const scrollRecord = sessionStorage.getItem(QWIK_CITY_SCROLL_RECORD);
  try {
    return JSON.parse(scrollRecord!) || {};
  } catch (e) {
    console.error('Failed to parse scroll positions', e);
    return {};
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

const scrollToHashId = (hash: string) => {
  const elmId = hash.slice(1);
  const elm = document.getElementById(elmId);
  if (elm) {
    // found element to scroll to
    elm.scrollIntoView();
  }
  return elm;
};

export interface ScrollHistoryWindow extends Window {
  _qCityScroll?: ScrollRecord;
}
