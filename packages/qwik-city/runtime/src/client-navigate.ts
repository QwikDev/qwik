import { isBrowser } from '@builder.io/qwik/build';
import type { QPrefetchData } from './service-worker/types';
import type { NavigationType } from './types';
import { isSameOrigin, isSamePath, toPath } from './utils';

export const clientNavigate = (
  win: Window,
  navType: NavigationType,
  fromURL: URL,
  toURL: URL,
  replaceState = false
) => {
  if (isSameOrigin(fromURL, toURL)) {
    if (navType === 'popstate') {
      clientHistoryState.id = win.history.state?.id ?? 0;
    } else {
      const samePath = isSamePath(fromURL, toURL);
      const sameHash = fromURL.hash === toURL.hash;
      if (!samePath || !sameHash) {
        if (replaceState) {
          win.history.replaceState({ id: ++clientHistoryState.id }, '', toPath(toURL));
        } else {
          // push to history for path or hash changes
          win.history.pushState({ id: ++clientHistoryState.id }, '', toPath(toURL));
        }
      }
    }
  }
};

const clientHistoryState = { id: 0 };

/**
 * @alpha
 * @returns A unique opaque id representing the current client history entry
 */
export const getHistoryId = () => '' + clientHistoryState.id;

/**
 * @internal
 */
export const resetHistoryId = () => (clientHistoryState.id = 0);

export const dispatchPrefetchEvent = (prefetchData: QPrefetchData) => {
  if (isBrowser) {
    document.dispatchEvent(new CustomEvent('qprefetch', { detail: prefetchData }));
  }
};
