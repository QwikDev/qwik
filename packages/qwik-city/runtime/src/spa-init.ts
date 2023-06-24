import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';
import type { ScrollState } from './types';

import { $ } from '@builder.io/qwik';

// TODO Dedupe handler code from here and QwikCityProvider?
// TODO Navigation API; check for support & simplify.

/**
 * !!! DO NOT IMPORT OR USE ANY EXTERNAL REFERENCES IN THIS SCRIPT.
 * SPA init script:
 * - Cached when upgrading to SPA.
 * - Reasonable expectation this file is already cached for history revisits.
 * - Robust, fully relies only on history. (scrollRestoration = 'manual')
 */
export default $((currentScript: HTMLScriptElement) => {
  const win: ClientSPAWindow = window;

  const currentPath = location.pathname + location.search;

  const spa = '_qCitySPA';
  const historyPatch = '_qCityHistoryPatch';
  const bootstrap = '_qCityBootstrap';
  const initPopstate = '_qCityInitPopstate';
  const initAnchors = '_qCityInitAnchors';
  const initVisibility = '_qCityInitVisibility';
  const initScroll = '_qCityInitScroll';
  const scrollEnabled = '_qCityScrollEnabled';
  const debounceTimeout = '_qCityScrollDebounce';
  const scrollHistory = '_qCityScroll';

  /**
   * TODO If loaded as deferred/async?:
   *  - Remove backup pop handler, if exists.
   */
  const checkAndScroll = (scrollState: ScrollState | undefined) => {
    if (scrollState) {
      win.scrollTo(scrollState.x, scrollState.y);
    }
  };

  const currentScrollState = (): ScrollState => {
    const elm = document.documentElement;
    return {
      x: elm.scrollLeft,
      y: elm.scrollTop,
      w: Math.max(elm.scrollWidth, elm.clientWidth),
      h: Math.max(elm.scrollHeight, elm.clientHeight),
    };
  };

  const saveScrollState = () => {
    const state: ScrollHistoryState = history.state || {};
    state[scrollHistory] = currentScrollState();
    history.replaceState(state, '');
  };

  const navigate = (href?: string) => {
    // Hook into useNavigate context, if available.
    // We hijack a <Link> here, goes through the loader, resumes, app, etc. Simple.
    // TODO Will only work with <Link>, is there a better way?
    const container = currentScript!.closest('[q\\:container]');
    const link = container!.querySelector('a[q\\:key="AD_1"]');

    if (link) {
      const bootstrapLink = link.cloneNode() as HTMLAnchorElement;

      if (href) {
        bootstrapLink.setAttribute('href', href);
      } else {
        bootstrapLink.setAttribute('q:navBootstrap', '');
      }

      container!.appendChild(bootstrapLink);
      win[bootstrap] = bootstrapLink;
      bootstrapLink.click();
      return true;
    } else {
      return false;
    }
  };

  if (
    !win[spa] &&
    !win[initPopstate] &&
    !win[initAnchors] &&
    !win[initVisibility] &&
    !win[initScroll]
  ) {
    saveScrollState();

    win[initPopstate] = () => {
      if (win[spa]) {
        return;
      }

      // Disable scroll handler eagerly to prevent overwriting history.state.
      win[scrollEnabled] = false;
      clearTimeout(win[debounceTimeout]);

      if (!navigate()) {
        if (currentPath !== location.pathname + location.search) {
          location.reload();
        } else {
          if (history.scrollRestoration === 'manual') {
            const scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
            checkAndScroll(scrollState);
            win[scrollEnabled] = true;
          }
        }
      }
    };

    if (!win[historyPatch]) {
      ((history) => {
        win[historyPatch] = true;
        const pushState = history.pushState;
        const replaceState = history.replaceState;

        const prepareState = (state: ScrollHistoryState) => {
          state = state || {};
          state._qCityScroll = state._qCityScroll || currentScrollState();
          return state;
        };

        history.pushState = (state: ScrollHistoryState, title, url) => {
          state = prepareState(state);
          return pushState.call(history, state, title, url);
        };

        history.replaceState = (state: ScrollHistoryState, title, url) => {
          state = prepareState(state);
          return replaceState.call(history, state, title, url);
        };
      })(history);
    }

    // We need this handler in init because Firefox destroys states w/ anchor tags.
    win[initAnchors] = (event: MouseEvent) => {
      if (win[spa] || event.defaultPrevented) {
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

          if (!navigate(href)) {
            if (dest.hash !== prev.hash) {
              history.pushState(null, '', dest);
            }

            const elmId = dest.hash.slice(1);
            const elm = document.getElementById(elmId);
            if (elm) {
              elm.scrollIntoView();
            }
          }
        }
      }
    };

    win[initVisibility] = () => {
      if (!win[spa] && win[scrollEnabled] && document.visibilityState === 'hidden') {
        // Last & most reliable point to commit state.
        // Do not clear timeout here in case debounce gets to run later.
        saveScrollState();
      }
    };

    win[initScroll] = () => {
      if (win[spa] || !win[scrollEnabled]) {
        return;
      }

      clearTimeout(win[debounceTimeout]);
      win[debounceTimeout] = setTimeout(() => {
        saveScrollState();
        // Needed for e2e debounceDetector.
        win[debounceTimeout] = undefined;
      }, 200);
    };

    win[scrollEnabled] = true;

    setTimeout(() => {
      addEventListener('popstate', win[initPopstate]!);
      addEventListener('scroll', win[initScroll]!, { passive: true });
      document.body.addEventListener('click', win[initAnchors]!);

      if (!(win as any).navigation) {
        document.addEventListener('visibilitychange', win[initVisibility]!, {
          passive: true,
        });
      }
    }, 0);
  }
});
