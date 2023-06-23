import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';
import type { ScrollState } from './types';

// TODO!!! Finalize this script, method of import, etc.
// TODO Dedupe handler code from here and QwikCityProvider.

export default (
  window: ClientSPAWindow,
  location: Location,
  history: History,
  document: Document
) => {
  const addEventListener = 'addEventListener';
  const scrollRestoration = 'scrollRestoration';

  const script = document.currentScript;
  const currentPath = location.pathname + location.search;

  const spa = '_qCitySPA';
  const bootstrap = '_qCityBootstrap';
  const initPopstate = '_qCityInitPopstate';
  const initAnchors = '_qCityInitAnchors';
  const initVisibility = '_qCityInitVisibility';
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

    const saveScrollState = () => {
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
    };

    const navigate = (href?: string) => {
      // Hook into useNavigate context, if available.
      // We hijack a <Link> here, goes through the loader, resumes, app, etc. Simple.
      // TODO Will only work with <Link>, is there a better way?
      const container = script?.closest('[q\\:container]');
      const link = container?.querySelector('a[q\\:key="AD_1"]');

      if (link) {
        const bootstrapLink = link.cloneNode() as HTMLAnchorElement;

        if (href) {
          bootstrapLink.setAttribute('href', href);
        } else {
          bootstrapLink.setAttribute('q:navBootstrap', '');
        }

        container!.appendChild(bootstrapLink);
        window[bootstrap] = bootstrapLink;
        bootstrapLink.click();
        return true;
      } else {
        return false;
      }
    };

    let scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
    checkAndScroll(scrollState);

    if (
      !window[spa] &&
      !window[initPopstate] &&
      !window[initAnchors] &&
      !window[initVisibility] &&
      !window[initScroll]
    ) {
      window[initPopstate] = () => {
        if (window[spa]) {
          return;
        }

        // Disable scroll handler eagerly to prevent overwriting history.state.
        window[scrollEnabled] = false;
        clearTimeout(window[debounceTimeout]);

        if (!navigate()) {
          if (currentPath !== location.pathname + location.search) {
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

      // We need this handler in init because Firefox destroys states w/ anchor tags.
      window[initAnchors] = (event: MouseEvent) => {
        if (window[spa] || event.defaultPrevented) {
          return;
        }

        const target = (event.target as HTMLElement).closest('a[href*="#"]');

        if (target && !target.hasAttribute('preventdefault:click')) {
          const href = target.getAttribute('href')!;
          const prev = new URL(location.href);
          const dest = new URL(href, prev);
          const sameOrigin = dest.origin === prev.origin;
          const samePath = dest.pathname + dest.search === prev.pathname + prev.search;
          // Patch only same-page hash anchors.
          if (sameOrigin && samePath) {
            event.preventDefault();
            navigate(href);
          }
        }
      };

      window[initVisibility] = () => {
        if (!window[spa] && window[scrollEnabled] && document.visibilityState === 'hidden') {
          // Last & most reliable point to commit state.
          // Do not clear timeout here in case debounce gets to run later.
          saveScrollState();
        }
      };

      window[initScroll] = () => {
        if (window[spa] || !window[scrollEnabled]) {
          return;
        }

        clearTimeout(window[debounceTimeout]);
        window[debounceTimeout] = setTimeout(() => {
          saveScrollState();
          // Needed for e2e debounceDetector.
          window[debounceTimeout] = undefined;
        }, 200);
      };

      window[scrollEnabled] = true;

      /**
       * TODO Patch history object?
       * TODO Navigation API; check for support & simplify.
       */

      setTimeout(() => {
        window[addEventListener]('popstate', window[initPopstate]!);
        window[addEventListener]('scroll', window[initScroll]!, { passive: true });
        document.body[addEventListener]('click', window[initAnchors]!);

        if (!(window as any).navigation) {
          document[addEventListener]('visibilitychange', window[initVisibility]!, {
            passive: true,
          });
        }
      }, 0);
    }
  }
};
