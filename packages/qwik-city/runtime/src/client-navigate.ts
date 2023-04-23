import { isBrowser } from '@builder.io/qwik/build';
import type { QPrefetchData } from './service-worker/types';
import type { NavigationType } from './types';
import { isSameOrigin, isSamePath, toPath } from './utils';

export const clientNavigate = (
  window: Window,
  navType: NavigationType,
  fromUrl: URL,
  toUrl: URL
) => {
  const win: ClientHistoryWindow = window as any;
  if (isSameOrigin(fromUrl, toUrl)) {
    if (navType === 'popstate') {
      clientHistoryState.id = win.history.state?.id ?? 0;
    } else {
      const samePath = isSamePath(fromUrl, toUrl);
      const sameHash = fromUrl.hash === toUrl.hash;
      // push to history for path or hash changes
      if (!samePath || !sameHash) {
        win.history.pushState({ id: ++clientHistoryState.id }, '', toPath(toUrl));
      }
      // mimic native hashchange event
      if (navType === 'link' && samePath && !sameHash) {
        win.dispatchEvent(
          new win.HashChangeEvent('hashchange', { newURL: toUrl.href, oldURL: fromUrl.href })
        );
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

interface ClientHistoryWindow extends Window {
  HashChangeEvent: new (type: string, eventInitDict?: HashChangeEventInit) => HashChangeEvent;
}
