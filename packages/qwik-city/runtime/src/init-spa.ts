// TODO!!! Finalize this file, method of import, etc.?
import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';
import type { ScrollState } from './types';

export default (
  window: ClientSPAWindow,
  location: Location,
  history: History,
  document: Document
) => {
  const scrollRestoration = 'scrollRestoration';

  const script = document.currentScript;
  const currentPath = location.pathname + location.search;

  const spa = '_qCitySPA';
  const bootstrap = '_qCityBootstrap';
  const initPopstate = '_qCityInitPopstate';
  const initScroll = '_qCityInitScroll';
  const scrollEnabled = '_qCityScrollEnabled';
  const debounceTimeout = '_qCityScrollDebounce';
  const scrollHistory = '_qCityScroll';

  /**
   * TODO Move this history.ScrollRestoration check into the shim script.
   * TODO Move scroll also into the shim script.
   * ? If shim has backup pop handler, this can be loaded as deferred/async?
   * ? If deferred/async:
   *    - Forward document.currentScript from shim.
   *    - Forward bootstrap ctx from shim.
   *    - Remove backup pop handler.
   *    - Save scroll state on load. (user can scroll during delay?)
   */
  if (history[scrollRestoration] === 'manual') {
    const checkAndScroll = (scrollState: ScrollState | undefined) => {
      if (scrollState) {
        window.scrollTo(scrollState.scrollX, scrollState.scrollY);
      }
    };

    let scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
    checkAndScroll(scrollState);

    if (!window[spa] && !window[initPopstate] && !window[initScroll]) {
      window[initPopstate] = () => {
        if (!window[spa]) {
          // Disable scroll handler eagerly to prevent overwriting history.state.
          window[scrollEnabled] = false;
          clearTimeout(window[debounceTimeout]);

          // Hook into useNavigate context, if available.
          // We hijack a <Link> here, goes through the loader, resumes, app, etc. Simple.
          // TODO Will only work with <Link>, is there a better way?
          // - Get symbol + check for ctx + create anchor?
          // - Less brittle, no need to rely on q:key?
          const container = script?.closest('[q\\:container]');
          const link = container?.querySelector('a[q\\:key="AD_1"]');

          if (link) {
            const bootstrapLink = link.cloneNode() as HTMLAnchorElement;
            bootstrapLink.setAttribute('q:navBootstrap', '');
            container!.appendChild(bootstrapLink);
            window[bootstrap] = bootstrapLink;
            bootstrapLink.click();
          } else if (currentPath !== location.pathname + location.search) {
            location.reload();
          } else {
            if (history[scrollRestoration] === 'manual') {
              scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
              checkAndScroll(scrollState);
              window[scrollEnabled] = true;
            }
          }
        }
      };

      window[initScroll] = () => {
        if (window[spa] || !window[scrollEnabled]) {
          return;
        }

        clearTimeout(window[debounceTimeout]);
        window[debounceTimeout] = setTimeout(() => {
          const elm = document.documentElement;
          const scrollState: ScrollState = {
            scrollX: elm.scrollLeft,
            scrollY: elm.scrollTop,
            scrollWidth: Math.max(elm.scrollWidth, elm.clientWidth),
            scrollHeight: Math.max(elm.scrollHeight, elm.clientHeight),
          };

          const state: ScrollHistoryState = history.state || {};
          state[scrollHistory] = scrollState;
          history.replaceState(state, '');
          // Needed for e2e debounceDetector.
          window[debounceTimeout] = undefined;
        }, 200);
      };

      window[scrollEnabled] = true;

      /**
       * TODO Patch same-page hash anchors?
       * TODO Visibility change handler for improved scrollState reliability.
       * TODO Patch history object?
       * TODO Navigation API; check for support & simplify.
       */

      setTimeout(() => {
        addEventListener('popstate', window[initPopstate]!);
        addEventListener('scroll', window[initScroll]!, { passive: true });
      }, 0);
    }
  }
};
