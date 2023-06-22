// TODO!!! Finalize this file, manual minification, etc.?
import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';
import type { ScrollState } from './types';

// TODO!!! Determine extent of need, method of import.
export default (
  window: ClientSPAWindow,
  location: Location,
  history: History,
  document: Document
) => {
  const script = document.currentScript;
  const currentPath = location.pathname + location.search;

  const spa = '_qCitySPA';
  const bootstrap = '_qCityBootstrap';
  const initPopstate = '_qCityInitPopstate';
  const initScroll = '_qCityInitScroll';
  const scrollEnabled = '_qCityScrollEnabled';
  const debounceTimeout = '_qCityScrollDebounce';
  const scrollHistory = '_qCityScroll';

  // TODO Replace this with extended script for recovering SPA.
  // Needs:
  // * - OnLoad:
  // * --- Always scroll if history._qCityScroll + scrollRestoration = 'manual'.
  // *         (might need to be inside SHIM depending how this is loaded)
  // --- Browser refresh on hashes?
  // * - Popstate Handler:
  // * --- Hook into Navigate context if available.
  // * --- Use a Link or ctx directly if possible (manifest?).
  // * --- If no Navigate context, use the fallback reload().
  // * - Scroll Handler:
  // * --- Setup a scroll handler to save scrollState.
  // * --- This is required in case we can't recover on this page. (no ctx, leaf edgecase)
  // * --- Also if we pop to restore Navigate ctx, saving current scroll to state is too late.
  // * --- Reuse the same `window._` that internal scroll handler uses.
  // * - Window:
  // * --- Define these on `window` in a way that Navigate upgrade can destroy them.
  // - Navigation API:
  // --- Leave a TODO for future Navigation PR to accommodate.
  // --- Likely will not need anything except 1 `navigate` handler to enter Navigate.

  // TODO Click hash anchor while on SPA w/o context?
  // TODO Click handler to patch same-page anchor hashes maybe.

  // TODO Replace this with the SHIM, if shim imports us then this MUST be 'manual'.
  // TODO Shim will scroll. If also pop handler then load this script as deferred?
  if (history.scrollRestoration === 'manual') {
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
          const container = script?.closest('[q\\:container]');
          const link = container?.querySelector('a[q\\:key="AD_1"]');

          if (link) {
            const bootstrapLink = link.cloneNode() as HTMLAnchorElement;
            bootstrapLink.setAttribute('q:bootstrap', '');
            container!.appendChild(bootstrapLink);
            window[bootstrap] = bootstrapLink;
            bootstrapLink.click();
          } else if (currentPath !== location.pathname + location.search) {
            location.reload();
          } else {
            scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
            checkAndScroll(scrollState);
            window[scrollEnabled] = true;
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

          const state: ScrollHistoryState = history.state;
          state[scrollHistory] = scrollState;
          history.replaceState(state, '');
          // Needed for e2e debounceDetector.
          window[debounceTimeout] = undefined;
        }, 200);
      };

      window[scrollEnabled] = true;

      setTimeout(() => {
        addEventListener('popstate', window[initPopstate]!);
        addEventListener('scroll', window[initScroll]!, { passive: true });
      }, 0);
    }
  }
};
