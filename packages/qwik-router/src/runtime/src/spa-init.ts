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
  if (win._qRouterInitPopstate) {
    return;
  }
  const currentPath = location.pathname + location.search;

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
    state._qRouterScroll = scrollState || currentScrollState();
    history.replaceState(state, '');
  };

  saveScrollState();

  // Also used in qwik-router-component.tsx to unregister
  win._qRouterInitPopstate = () => {
    if (win._qRouterSPA) {
      return;
    }

    // Disable scroll handler eagerly to prevent overwriting history.state.
    win._qRouterScrollEnabled = false;
    clearTimeout(win._qRouterScrollDebounce);

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
        const scrollState = (history.state as ScrollHistoryState)?._qRouterScroll;
        checkAndScroll(scrollState);
        win._qRouterScrollEnabled = true;
      }
    }
  };

  if (!win._qRouterHistoryPatch) {
    win._qRouterHistoryPatch = true;
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
  win._qRouterInitAnchors = (event: MouseEvent) => {
    if (win._qRouterSPA || event.defaultPrevented) {
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
            win._qRouterScrollEnabled = false;
            clearTimeout(win._qRouterScrollDebounce);
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

  win._qRouterInitVisibility = () => {
    if (!win._qRouterSPA && win._qRouterScrollEnabled && document.visibilityState === 'hidden') {
      saveScrollState();
    }
  };

  win._qRouterInitScroll = () => {
    if (win._qRouterSPA || !win._qRouterScrollEnabled) {
      return;
    }

    clearTimeout(win._qRouterScrollDebounce);
    win._qRouterScrollDebounce = setTimeout(() => {
      saveScrollState();
      // Needed for e2e debounceDetector.
      win._qRouterScrollDebounce = undefined;
    }, 200);
  };

  win._qRouterScrollEnabled = true;

  setTimeout(() => {
    win.addEventListener('popstate', win._qRouterInitPopstate!);
    win.addEventListener('scroll', win._qRouterInitScroll!, { passive: true });
    document.body.addEventListener('click', win._qRouterInitAnchors!);

    if (!(win as any).navigation) {
      document.addEventListener('visibilitychange', win._qRouterInitVisibility!, {
        passive: true,
      });
    }
  }, 0);
});
