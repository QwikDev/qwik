import type { ContextId, DomContainer, _ContainerElement } from 'packages/qwik/core-internal';
import type { ClientSPAWindow } from './qwik-router-component';
import type { ScrollHistoryState } from './scroll-restoration';
import type { RouteNavigate, ScrollState } from './types';

import { event$, isDev } from '@qwik.dev/core';

// TODO Dedupe handler code from here and QwikRouterProvider?
// TODO Navigation API; check for support & simplify.

// SPA init script:
// - Pre-cached when upgrading to SPA.
// - Reasonable expectation this file is already cached for history revisits.
// - Robust, fully relies only on history. (scrollRestoration = 'manual')

// ! DO NOT IMPORT OR USE ANY EXTERNAL REFERENCES IN THIS SCRIPT.
export default event$((_: Event, el: Element) => {
  const win: ClientSPAWindow = window;
  const spa = '_qRouterSPA';
  const initPopstate = '_qRouterInitPopstate';
  const initAnchors = '_qRouterInitAnchors';
  const initVisibility = '_qRouterInitVisibility';
  const initScroll = '_qRouterInitScroll';
  if (
    !win[spa] &&
    !win[initPopstate] &&
    !win[initAnchors] &&
    !win[initVisibility] &&
    !win[initScroll]
  ) {
    const currentPath = location.pathname + location.search;

    const historyPatch = '_qRouterHistoryPatch';
    const scrollEnabled = '_qRouterScrollEnabled';
    const debounceTimeout = '_qRouterScrollDebounce';
    const scrollHistory = '_qRouterScroll';

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

    const saveScrollState = (scrollState?: ScrollState) => {
      const state: ScrollHistoryState = history.state || {};
      state[scrollHistory] = scrollState || currentScrollState();
      history.replaceState(state, '');
    };

    saveScrollState();

    win[initPopstate] = () => {
      if (win[spa]) {
        return;
      }

      // Disable scroll handler eagerly to prevent overwriting history.state.
      win[scrollEnabled] = false;
      clearTimeout(win[debounceTimeout]);

      if (currentPath !== location.pathname + location.search) {
        const getContainer = (el: Element) =>
          el.closest('[q\\:container]:not([q\\:container=html]):not([q\\:container=text])');

        const container = getContainer(el);
        const domContainer = (container as _ContainerElement).qContainer as DomContainer;
        const hostElement = domContainer.vNodeLocate(el);

        const nav = domContainer?.resolveContext(hostElement, {
          id: 'qc--n',
        } as ContextId<RouteNavigate>);

        if (nav) {
          nav(location.href, { type: 'popstate' });
        } else {
          // No useNavigate ctx available, fallback to reload.
          location.reload();
        }
      } else {
        if (history.scrollRestoration === 'manual') {
          const scrollState = (history.state as ScrollHistoryState)?.[scrollHistory];
          checkAndScroll(scrollState);
          win[scrollEnabled] = true;
        }
      }
    };

    if (!win[historyPatch]) {
      win[historyPatch] = true;
      const pushState = history.pushState;
      const replaceState = history.replaceState;

      const prepareState = (state: any) => {
        if (state === null || typeof state === 'undefined') {
          state = {};
        } else if (state?.constructor !== Object) {
          state = { _data: state };

          if (isDev) {
            console.warn(
              'In a Qwik SPA context, `history.state` is used to store scroll state. ' +
                'Direct calls to `pushState()` and `replaceState()` must supply an actual Object type. ' +
                'We need to be able to automatically attach the scroll state to your state object. ' +
                'A new state object has been created, your data has been moved to: `history.state._data`'
            );
          }
        }

        state._qRouterScroll = state._qRouterScroll || currentScrollState();
        return state;
      };

      history.pushState = (state, title, url) => {
        state = prepareState(state);
        return pushState.call(history, state, title, url);
      };

      history.replaceState = (state, title, url) => {
        state = prepareState(state);
        return replaceState.call(history, state, title, url);
      };
    }

    // We need this handler in init because Firefox destroys states w/ anchor tags.
    win[initAnchors] = (event: MouseEvent) => {
      if (win[spa] || event.defaultPrevented) {
        return;
      }

      const target = (event.target as HTMLElement).closest('a[href]');

      if (target && !target.hasAttribute('preventdefault:click')) {
        const href = target.getAttribute('href')!;
        const prev = new URL(location.href);
        const dest = new URL(href, prev);
        const sameOrigin = dest.origin === prev.origin;
        const samePath = dest.pathname + dest.search === prev.pathname + prev.search;
        // Patch only same-page anchors.
        if (sameOrigin && samePath) {
          event.preventDefault();

          // Check href because empty hashes don't register.
          if (dest.href !== prev.href) {
            history.pushState(null, '', dest);
          }

          if (!dest.hash) {
            if (dest.href.endsWith('#')) {
              window.scrollTo(0, 0);
            } else {
              // Simulate same-page (no hash) anchor reload.
              // history.scrollRestoration = 'manual' makes these not scroll.
              win[scrollEnabled] = false;
              clearTimeout(win[debounceTimeout]);
              saveScrollState({ ...currentScrollState(), x: 0, y: 0 });
              location.reload();
            }
          } else {
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
      win.addEventListener('popstate', win[initPopstate]!);
      win.addEventListener('scroll', win[initScroll]!, { passive: true });
      document.addEventListener('click', win[initAnchors]!);

      if (!(win as any).navigation) {
        document.addEventListener('visibilitychange', win[initVisibility]!, {
          passive: true,
        });
      }
    }, 0);
  }
});
