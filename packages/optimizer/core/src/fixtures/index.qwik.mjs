import { jsx, Fragment, jsxs } from '@qwik.dev/core/jsx-runtime';
import {
  component$,
  useErrorBoundary,
  useOnWindow,
  $,
  Slot,
  createContextId,
  useContext,
  implicit$FirstArg,
  noSerialize,
  useVisibleTask$,
  useServerData,
  useSignal,
  untrack,
  sync$,
  isDev,
  withLocale,
  event$,
  isServer,
  useStyles$,
  useStore,
  isBrowser,
  useContextProvider,
  useTask$,
  getLocale,
  jsx as jsx$1,
  SkipRender,
  createElement,
} from '@qwik.dev/core';
import {
  g as getClientNavPath,
  s as shouldPreload,
  p as preloadRouteBundles,
  l as loadClientData,
  i as isPromise,
  a as isSamePath,
  c as createLoaderSignal,
  t as toUrl,
  b as isSameOrigin,
  d as loadRoute,
  D as DEFAULT_LOADERS_SERIALIZATION_STRATEGY,
  C as CLIENT_DATA_CACHE,
  Q as Q_ROUTE,
  e as clientNavigate,
  f as QFN_KEY,
  h as QACTION_KEY,
  j as QDATA_KEY,
} from './chunks/routing.qwik.mjs';
import * as qwikRouterConfig from '@qwik-router-config';
import {
  _getContextContainer,
  SerializerSymbol,
  _UNINITIALIZED,
  _hasStoreEffects,
  forceStoreEffects,
  _waitUntilRendered,
  _getContextHostElement,
  _getContextEvent,
  _serialize,
  _deserialize,
  _resolveContextWithoutSequentialScope,
} from '@qwik.dev/core/internal';
import { _asyncRequestStore } from '@qwik.dev/router/middleware/request-handler';
import * as v from 'valibot';
import * as z from 'zod';
export { z } from 'zod';
import swRegister from '@qwik-router-sw-register';
import { renderToStream } from '@qwik.dev/core/server';
import '@qwik.dev/core/preloader';
import './chunks/types.qwik.mjs';

const ErrorBoundary = component$((props) => {
  const store = useErrorBoundary();
  useOnWindow(
    'qerror',
    $((e) => {
      store.error = e.detail.error;
    })
  );
  if (store.error && props.fallback$) {
    return /* @__PURE__ */ jsx(Fragment, { children: props.fallback$(store.error) });
  }
  return /* @__PURE__ */ jsx(Slot, {});
});

const RouteStateContext = /* @__PURE__ */ createContextId('qc-s');
const ContentContext = /* @__PURE__ */ createContextId('qc-c');
const ContentInternalContext = /* @__PURE__ */ createContextId('qc-ic');
const DocumentHeadContext = /* @__PURE__ */ createContextId('qc-h');
const RouteLocationContext = /* @__PURE__ */ createContextId('qc-l');
const RouteNavigateContext = /* @__PURE__ */ createContextId('qc-n');
const RouteActionContext = /* @__PURE__ */ createContextId('qc-a');
const RoutePreventNavigateContext = /* @__PURE__ */ createContextId('qc-p');

const useContent = () => useContext(ContentContext);
const useDocumentHead = () => useContext(DocumentHeadContext);
const useLocation = () => useContext(RouteLocationContext);
const useNavigate = () => useContext(RouteNavigateContext);
const usePreventNavigateQrl = (fn) => {
  if (!__EXPERIMENTAL__.preventNavigate) {
    throw new Error(
      'usePreventNavigate$ is experimental and must be enabled with `experimental: ["preventNavigate"]` in the `qwikVite` plugin.'
    );
  }
  const registerPreventNav = useContext(RoutePreventNavigateContext);
  useVisibleTask$(() => registerPreventNav(fn));
};
const usePreventNavigate$ = implicit$FirstArg(usePreventNavigateQrl);
const useAction = () => useContext(RouteActionContext);
const useQwikRouterEnv = () => noSerialize(useServerData('qwikrouter'));

const Link = component$((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const anchorRef = useSignal();
  const {
    onClick$,
    prefetch: prefetchProp,
    reload,
    replaceState,
    scroll,
    ...linkProps
  } = /* @__PURE__ */ (() => props)();
  const clientNavPath = untrack(getClientNavPath, { ...linkProps, reload }, loc);
  linkProps.href = clientNavPath || originalHref;
  const prefetchData =
    (!!clientNavPath && prefetchProp !== false && prefetchProp !== 'js') || void 0;
  const prefetch =
    prefetchData ||
    (!!clientNavPath && prefetchProp !== false && untrack(shouldPreload, clientNavPath, loc));
  const handlePrefetch = prefetch
    ? $((_, elm) => {
        if (navigator.connection?.saveData) {
          return;
        }
        if (elm && elm.href) {
          const url = new URL(elm.href);
          preloadRouteBundles(url.pathname);
          if (elm.hasAttribute('data-prefetch')) {
            loadClientData(url, {
              preloadRouteBundles: false,
              isPrefetch: true,
            });
          }
        }
      })
    : void 0;
  const preventDefault = clientNavPath
    ? sync$((event) => {
        if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
          event.preventDefault();
        }
      })
    : void 0;
  const handleClientSideNavigation = clientNavPath
    ? $((event, elm) => {
        if (event.defaultPrevented) {
          if (elm.href) {
            elm.setAttribute('aria-pressed', 'true');
            nav(elm.href, { forceReload: reload, replaceState, scroll }).then(() => {
              elm.removeAttribute('aria-pressed');
            });
          }
        }
      })
    : void 0;
  const handlePreload = $((_, elm) => {
    const url = new URL(elm.href);
    preloadRouteBundles(url.pathname, 1);
  });
  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    const handler = linkProps.onQVisible$;
    if (handler) {
      const event = new CustomEvent('qvisible');
      if (Array.isArray(handler)) {
        handler.flat(10).forEach((handler2) => handler2?.(event, anchorRef.value));
      } else {
        handler?.(event, anchorRef.value);
      }
    }
    if (!isDev && anchorRef.value) {
      handlePrefetch?.(void 0, anchorRef.value);
    }
  });
  return /* @__PURE__ */ jsx('a', {
    ref: anchorRef,
    ...{ 'q:link': !!clientNavPath },
    ...linkProps,
    onClick$: [
      preventDefault,
      handlePreload,
      // needs to be in between preventDefault and onClick$ to ensure it starts asap.
      onClick$,
      handleClientSideNavigation,
    ],
    'data-prefetch': prefetchData,
    onMouseOver$: [linkProps.onMouseOver$, handlePrefetch],
    onFocus$: [linkProps.onFocus$, handlePrefetch],
    onQVisible$: [],
    children: /* @__PURE__ */ jsx(Slot, {}),
  });
});

const resolveHead = (endpoint, routeLocation, contentModules, locale, defaults) =>
  withLocale(locale, () => {
    const head = createDocumentHead(defaults);
    const getData = (loaderOrAction) => {
      const id = loaderOrAction.__id;
      if (loaderOrAction.__brand === 'server_loader') {
        if (!(id in endpoint.loaders)) {
          throw new Error(
            'You can not get the returned data of a loader that has not been executed for this request.'
          );
        }
      }
      const data = endpoint.loaders[id];
      if (isPromise(data)) {
        throw new Error('Loaders returning a promise can not be resolved for the head function.');
      }
      return data;
    };
    const fns = [];
    for (const contentModule of contentModules) {
      const contentModuleHead = contentModule?.head;
      if (contentModuleHead) {
        if (typeof contentModuleHead === 'function') {
          fns.unshift(contentModuleHead);
        } else if (typeof contentModuleHead === 'object') {
          resolveDocumentHead(head, contentModuleHead);
        }
      }
    }
    if (fns.length) {
      const headProps = {
        head,
        withLocale: (fn) => fn(),
        resolveValue: getData,
        ...routeLocation,
      };
      for (const fn of fns) {
        resolveDocumentHead(head, fn(headProps));
      }
    }
    return head;
  });
const resolveDocumentHead = (resolvedHead, updatedHead) => {
  if (typeof updatedHead.title === 'string') {
    resolvedHead.title = updatedHead.title;
  }
  mergeArray(resolvedHead.meta, updatedHead.meta);
  mergeArray(resolvedHead.links, updatedHead.links);
  mergeArray(resolvedHead.styles, updatedHead.styles);
  mergeArray(resolvedHead.scripts, updatedHead.scripts);
  Object.assign(resolvedHead.frontmatter, updatedHead.frontmatter);
};
const mergeArray = (existingArr, newArr) => {
  if (Array.isArray(newArr)) {
    for (const newItem of newArr) {
      if (typeof newItem.key === 'string') {
        const existingIndex = existingArr.findIndex((i) => i.key === newItem.key);
        if (existingIndex > -1) {
          existingArr[existingIndex] = newItem;
          continue;
        }
      }
      existingArr.push(newItem);
    }
  }
};
const createDocumentHead = (defaults) => ({
  title: defaults?.title || '',
  meta: [...(defaults?.meta || [])],
  links: [...(defaults?.links || [])],
  styles: [...(defaults?.styles || [])],
  scripts: [...(defaults?.scripts || [])],
  frontmatter: { ...defaults?.frontmatter },
});

const transitionCss =
  '@layer qwik{@supports selector(html:active-view-transition-type(type)){html:active-view-transition-type(qwik-navigation){:root{view-transition-name:none}}}@supports not selector(html:active-view-transition-type(type)){:root{view-transition-name:none}}}';

function callRestoreScrollOnDocument() {
  if (document.__q_scroll_restore__) {
    document.__q_scroll_restore__();
    document.__q_scroll_restore__ = void 0;
  }
}
const restoreScroll = (type, toUrl, fromUrl, scroller, scrollState) => {
  if (type === 'popstate' && scrollState) {
    scroller.scrollTo(scrollState.x, scrollState.y);
  } else if (type === 'link' || type === 'form') {
    if (!hashScroll(toUrl, fromUrl)) {
      scroller.scrollTo(0, 0);
    }
  }
};
const hashScroll = (toUrl, fromUrl) => {
  const elmId = toUrl.hash.slice(1);
  const elm = elmId && document.getElementById(elmId);
  if (elm) {
    elm.scrollIntoView();
    return true;
  } else if (!elm && toUrl.hash && isSamePath(toUrl, fromUrl)) {
    return true;
  }
  return false;
};
const currentScrollState = (elm) => {
  return {
    x: elm.scrollLeft,
    y: elm.scrollTop,
    w: Math.max(elm.scrollWidth, elm.clientWidth),
    h: Math.max(elm.scrollHeight, elm.clientHeight),
  };
};
const getScrollHistory = () => {
  const state = history.state;
  return state?._qRouterScroll;
};
const saveScrollHistory = (scrollState) => {
  const state = history.state || {};
  state._qRouterScroll = scrollState;
  history.replaceState(state, '');
};

const spaInit = event$((_, el) => {
  if (!window._qRouterSPA && !window._qRouterInitPopstate) {
    const currentPath = location.pathname + location.search;
    const checkAndScroll = (scrollState) => {
      if (scrollState) {
        window.scrollTo(scrollState.x, scrollState.y);
      }
    };
    const currentScrollState = () => {
      const elm = document.documentElement;
      return {
        x: elm.scrollLeft,
        y: elm.scrollTop,
        w: Math.max(elm.scrollWidth, elm.clientWidth),
        h: Math.max(elm.scrollHeight, elm.clientHeight),
      };
    };
    const saveScrollState = (scrollState) => {
      const state = history.state || {};
      state._qRouterScroll = scrollState || currentScrollState();
      history.replaceState(state, '');
    };
    saveScrollState();
    window._qRouterInitPopstate = () => {
      if (window._qRouterSPA) {
        return;
      }
      window._qRouterScrollEnabled = false;
      clearTimeout(window._qRouterScrollDebounce);
      if (currentPath !== location.pathname + location.search) {
        const getContainer = (el2) =>
          el2.closest('[q\\:container]:not([q\\:container=html]):not([q\\:container=text])');
        const container = getContainer(el);
        const domContainer = container.qContainer;
        const hostElement = domContainer.vNodeLocate(el);
        const nav = domContainer?.resolveContext(hostElement, {
          id: 'qc--n',
        });
        if (nav) {
          nav(location.href, { type: 'popstate' });
        } else {
          location.reload();
        }
      } else {
        if (history.scrollRestoration === 'manual') {
          const scrollState = history.state?._qRouterScroll;
          checkAndScroll(scrollState);
          window._qRouterScrollEnabled = true;
        }
      }
    };
    if (!window._qRouterHistoryPatch) {
      window._qRouterHistoryPatch = true;
      const pushState = history.pushState;
      const replaceState = history.replaceState;
      const prepareState = (state) => {
        if (state === null || typeof state === 'undefined') {
          state = {};
        } else if (state?.constructor !== Object) {
          state = { _data: state };
          if (isDev) {
            console.warn(
              'In a Qwik SPA context, `history.state` is used to store scroll state. Direct calls to `pushState()` and `replaceState()` must supply an actual Object type. We need to be able to automatically attach the scroll state to your state object. A new state object has been created, your data has been moved to: `history.state._data`'
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
    window._qRouterInitAnchors = (event) => {
      if (window._qRouterSPA || event.defaultPrevented) {
        return;
      }
      const target = event.target.closest('a[href]');
      if (target && !target.hasAttribute('preventdefault:click')) {
        const href = target.getAttribute('href');
        const prev = new URL(location.href);
        const dest = new URL(href, prev);
        const sameOrigin = dest.origin === prev.origin;
        const samePath = dest.pathname + dest.search === prev.pathname + prev.search;
        if (sameOrigin && samePath) {
          event.preventDefault();
          if (dest.href !== prev.href) {
            history.pushState(null, '', dest);
          }
          if (!dest.hash) {
            if (dest.href.endsWith('#')) {
              window.scrollTo(0, 0);
            } else {
              window._qRouterScrollEnabled = false;
              clearTimeout(window._qRouterScrollDebounce);
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
    window._qRouterInitVisibility = () => {
      if (
        !window._qRouterSPA &&
        window._qRouterScrollEnabled &&
        document.visibilityState === 'hidden'
      ) {
        saveScrollState();
      }
    };
    window._qRouterInitScroll = () => {
      if (window._qRouterSPA || !window._qRouterScrollEnabled) {
        return;
      }
      clearTimeout(window._qRouterScrollDebounce);
      window._qRouterScrollDebounce = setTimeout(() => {
        saveScrollState();
        window._qRouterScrollDebounce = void 0;
      }, 200);
    };
    window._qRouterScrollEnabled = true;
    setTimeout(() => {
      window.addEventListener('popstate', window._qRouterInitPopstate);
      window.addEventListener('scroll', window._qRouterInitScroll, { passive: true });
      document.addEventListener('click', window._qRouterInitAnchors);
      if (!window.navigation) {
        document.addEventListener('visibilitychange', window._qRouterInitVisibility, {
          passive: true,
        });
      }
    }, 0);
  }
});

const startViewTransition = (params) => {
  if (!params.update) {
    return;
  }
  if ('startViewTransition' in document) {
    let transition;
    try {
      transition = document.startViewTransition(params);
    } catch {
      transition = document.startViewTransition(params.update);
    }
    const event = new CustomEvent('qviewtransition', { detail: transition });
    document.dispatchEvent(event);
    return transition;
  } else {
    params.update?.();
  }
};

const QWIK_CITY_SCROLLER = '_qCityScroller';
const QWIK_ROUTER_SCROLLER = '_qRouterScroller';
const preventNav = {};
const internalState = { navCount: 0 };
const useQwikRouter = (props) => {
  if (!isServer) {
    throw new Error(
      'useQwikRouter can only run during SSR on the server. If you are seeing this, it means you are re-rendering the root of your application. Fix that or use the <QwikRouterProvider> component around the root of your application.'
    );
  }
  useStyles$(transitionCss);
  const env = useQwikRouterEnv();
  if (!env?.params) {
    throw new Error(
      `Missing Qwik Router Env Data for help visit https://github.com/QwikDev/qwik/issues/6237`
    );
  }
  const urlEnv = useServerData('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }
  const serverHead = useServerData('documentHead');
  if (
    env.ev.originalUrl.pathname !== env.ev.url.pathname &&
    !__EXPERIMENTAL__.enableRequestRewrite
  ) {
    throw new Error(
      `enableRequestRewrite is an experimental feature and is not enabled. Please enable the feature flag by adding \`experimental: ["enableRequestRewrite"]\` to your qwikVite plugin options.`
    );
  }
  const url = new URL(urlEnv);
  const routeLocationTarget = {
    url,
    params: env.params,
    isNavigating: false,
    prevUrl: void 0,
  };
  const routeLocation = useStore(routeLocationTarget, { deep: false });
  const navResolver = {};
  const container = _getContextContainer();
  const getSerializationStrategy = (loaderId) => {
    return (
      env.response.loadersSerializationStrategy.get(loaderId) ||
      DEFAULT_LOADERS_SERIALIZATION_STRATEGY
    );
  };
  const loadersObject = {};
  const loaderState = {};
  for (const [key, value] of Object.entries(env.response.loaders)) {
    loadersObject[key] = value;
    loaderState[key] = createLoaderSignal(
      loadersObject,
      key,
      url,
      getSerializationStrategy(key),
      container
    );
  }
  loadersObject[SerializerSymbol] = (obj) => {
    const loadersSerializationObject = {};
    for (const [k, v] of Object.entries(obj)) {
      loadersSerializationObject[k] = getSerializationStrategy(k) === 'always' ? v : _UNINITIALIZED;
    }
    return loadersSerializationObject;
  };
  const routeInternal = useSignal({
    type: 'initial',
    dest: url,
    scroll: true,
  });
  const documentHead = useStore(() => createDocumentHead(serverHead));
  const content = useStore({
    headings: void 0,
    menu: void 0,
  });
  const contentInternal = useSignal();
  const currentActionId = env.response.action;
  const currentAction = currentActionId ? env.response.loaders[currentActionId] : void 0;
  const actionState = useSignal(
    currentAction
      ? {
          id: currentActionId,
          data: env.response.formData,
          output: {
            result: currentAction,
            status: env.response.status,
          },
        }
      : void 0
  );
  const registerPreventNav = $((fn$) => {
    if (!isBrowser) {
      return;
    }
    preventNav.$handler$ ||= (event) => {
      internalState.navCount++;
      if (!preventNav.$cbs$) {
        return;
      }
      const prevents = [...preventNav.$cbs$.values()].map((cb) =>
        cb.resolved ? cb.resolved() : cb()
      );
      if (prevents.some(Boolean)) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    (preventNav.$cbs$ ||= /* @__PURE__ */ new Set()).add(fn$);
    fn$.resolve();
    window.addEventListener('beforeunload', preventNav.$handler$);
    return () => {
      if (preventNav.$cbs$) {
        preventNav.$cbs$.delete(fn$);
        if (!preventNav.$cbs$.size) {
          preventNav.$cbs$ = void 0;
          window.removeEventListener('beforeunload', preventNav.$handler$);
        }
      }
    };
  });
  const goto = $(async (path, opt) => {
    const {
      type = 'link',
      forceReload = path === void 0,
      // Hack for nav() because this API is already set.
      replaceState = false,
      scroll = true,
    } = typeof opt === 'object' ? opt : { forceReload: opt };
    internalState.navCount++;
    if (isBrowser && type === 'link' && routeInternal.value.type === 'initial') {
      const url2 = new URL(window.location.href);
      routeInternal.value.dest = url2;
      routeLocation.url = url2;
    }
    const lastDest = routeInternal.value.dest;
    const dest =
      path === void 0 ? lastDest : typeof path === 'number' ? path : toUrl(path, routeLocation.url);
    if (
      preventNav.$cbs$ &&
      (forceReload ||
        typeof dest === 'number' ||
        !isSamePath(dest, lastDest) ||
        !isSameOrigin(dest, lastDest))
    ) {
      const ourNavId = internalState.navCount;
      const prevents = await Promise.all([...preventNav.$cbs$.values()].map((cb) => cb(dest)));
      if (ourNavId !== internalState.navCount || prevents.some(Boolean)) {
        if (ourNavId === internalState.navCount && type === 'popstate') {
          history.pushState(null, '', lastDest);
        }
        return;
      }
    }
    if (typeof dest === 'number') {
      if (isBrowser) {
        history.go(dest);
      }
      return;
    }
    if (!isSameOrigin(dest, lastDest)) {
      if (isBrowser) {
        location.href = dest.href;
      }
      return;
    }
    if (!forceReload && isSamePath(dest, lastDest)) {
      if (isBrowser) {
        if (type === 'link' && dest.href !== location.href) {
          history.pushState(null, '', dest);
        }
        let scroller = document.getElementById(QWIK_ROUTER_SCROLLER);
        if (!scroller) {
          scroller = document.getElementById(QWIK_CITY_SCROLLER);
          if (scroller && isDev) {
            console.warn(
              `Please update your scroller ID to "${QWIK_ROUTER_SCROLLER}" as "${QWIK_CITY_SCROLLER}" is deprecated and will be removed in V3`
            );
          }
        }
        if (!scroller) {
          scroller = document.documentElement;
        }
        restoreScroll(type, dest, new URL(location.href), scroller, getScrollHistory());
        if (type === 'popstate') {
          window._qRouterScrollEnabled = true;
        }
      }
      return;
    }
    routeInternal.value = {
      type,
      dest,
      forceReload,
      replaceState,
      scroll,
    };
    if (isBrowser) {
      loadClientData(dest);
      loadRoute(
        qwikRouterConfig.routes,
        qwikRouterConfig.menus,
        qwikRouterConfig.cacheModules,
        dest.pathname
      );
    }
    actionState.value = void 0;
    routeLocation.isNavigating = true;
    return new Promise((resolve) => {
      navResolver.r = resolve;
    });
  });
  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteActionContext, actionState);
  useContextProvider(RoutePreventNavigateContext, registerPreventNav);
  useTask$(({ track }) => {
    async function run() {
      const navigation = track(routeInternal);
      const action = track(actionState);
      const locale = getLocale('');
      const prevUrl = routeLocation.url;
      const navType = action ? 'form' : navigation.type;
      const replaceState = navigation.replaceState;
      let trackUrl;
      let clientPageData;
      let loadedRoute = null;
      let container2;
      if (isServer) {
        trackUrl = new URL(navigation.dest, routeLocation.url);
        loadedRoute = env.loadedRoute;
        clientPageData = env.response;
      } else {
        trackUrl = new URL(navigation.dest, location);
        if (trackUrl.pathname.endsWith('/')) {
          if (globalThis.__NO_TRAILING_SLASH__) {
            trackUrl.pathname = trackUrl.pathname.slice(0, -1);
          }
        } else if (!globalThis.__NO_TRAILING_SLASH__) {
          trackUrl.pathname += '/';
        }
        let loadRoutePromise = loadRoute(
          qwikRouterConfig.routes,
          qwikRouterConfig.menus,
          qwikRouterConfig.cacheModules,
          trackUrl.pathname
        );
        container2 = _getContextContainer();
        const pageData = (clientPageData = await loadClientData(trackUrl, {
          action,
          clearCache: true,
        }));
        if (!pageData) {
          routeInternal.untrackedValue = { type: navType, dest: trackUrl };
          return;
        }
        const newHref = pageData.href;
        const newURL = new URL(newHref, trackUrl);
        if (!isSamePath(newURL, trackUrl)) {
          if (!pageData.isRewrite) {
            trackUrl = newURL;
          }
          loadRoutePromise = loadRoute(
            qwikRouterConfig.routes,
            qwikRouterConfig.menus,
            qwikRouterConfig.cacheModules,
            newURL.pathname
            // Load the actual required path.
          );
        }
        try {
          loadedRoute = await loadRoutePromise;
        } catch (e) {
          console.error(e);
          window.location.href = newHref;
          return;
        }
      }
      if (loadedRoute) {
        const [routeName, params, mods, menu] = loadedRoute;
        const contentModules = mods;
        const pageModule = contentModules[contentModules.length - 1];
        if (navigation.dest.search && !!isSamePath(trackUrl, prevUrl)) {
          trackUrl.search = navigation.dest.search;
        }
        let shouldForcePrevUrl = false;
        let shouldForceUrl = false;
        let shouldForceParams = false;
        if (!isSamePath(trackUrl, prevUrl)) {
          if (_hasStoreEffects(routeLocation, 'prevUrl')) {
            shouldForcePrevUrl = true;
          }
          routeLocationTarget.prevUrl = prevUrl;
        }
        if (routeLocationTarget.url !== trackUrl) {
          if (_hasStoreEffects(routeLocation, 'url')) {
            shouldForceUrl = true;
          }
          routeLocationTarget.url = trackUrl;
        }
        if (routeLocationTarget.params !== params) {
          if (_hasStoreEffects(routeLocation, 'params')) {
            shouldForceParams = true;
          }
          routeLocationTarget.params = params;
        }
        routeInternal.untrackedValue = { type: navType, dest: trackUrl };
        const resolvedHead = resolveHead(
          clientPageData,
          routeLocation,
          contentModules,
          locale,
          serverHead
        );
        content.headings = pageModule.headings;
        content.menu = menu;
        contentInternal.untrackedValue = noSerialize(contentModules);
        documentHead.links = resolvedHead.links;
        documentHead.meta = resolvedHead.meta;
        documentHead.styles = resolvedHead.styles;
        documentHead.scripts = resolvedHead.scripts;
        documentHead.title = resolvedHead.title;
        documentHead.frontmatter = resolvedHead.frontmatter;
        if (isBrowser) {
          let scrollState;
          if (navType === 'popstate') {
            scrollState = getScrollHistory();
          }
          const scroller =
            document.getElementById(QWIK_ROUTER_SCROLLER) ?? document.documentElement;
          if (
            (navigation.scroll &&
              (!navigation.forceReload || !isSamePath(trackUrl, prevUrl)) &&
              (navType === 'link' || navType === 'popstate')) || // Action might have responded with a redirect.
            (navType === 'form' && !isSamePath(trackUrl, prevUrl))
          ) {
            document.__q_scroll_restore__ = () =>
              restoreScroll(navType, trackUrl, prevUrl, scroller, scrollState);
          }
          const loaders = clientPageData?.loaders;
          if (loaders) {
            const container3 = _getContextContainer();
            for (const [key, value] of Object.entries(loaders)) {
              const signal = loaderState[key];
              const awaitedValue = await value;
              loadersObject[key] = awaitedValue;
              if (!signal) {
                loaderState[key] = createLoaderSignal(
                  loadersObject,
                  key,
                  trackUrl,
                  DEFAULT_LOADERS_SERIALIZATION_STRATEGY,
                  container3
                );
              } else {
                signal.invalidate();
              }
            }
          }
          CLIENT_DATA_CACHE.clear();
          if (!window._qRouterSPA) {
            window._qRouterSPA = true;
            history.scrollRestoration = 'manual';
            window.addEventListener('popstate', () => {
              window._qRouterScrollEnabled = false;
              clearTimeout(window._qRouterScrollDebounce);
              goto(location.href, {
                type: 'popstate',
              });
            });
            window.removeEventListener('popstate', window._qRouterInitPopstate);
            window._qRouterInitPopstate = void 0;
            if (!window._qRouterHistoryPatch) {
              window._qRouterHistoryPatch = true;
              const pushState = history.pushState;
              const replaceState2 = history.replaceState;
              const prepareState = (state) => {
                if (state === null || typeof state === 'undefined') {
                  state = {};
                } else if (state?.constructor !== Object) {
                  state = { _data: state };
                  if (isDev) {
                    console.warn(
                      'In a Qwik SPA context, `history.state` is used to store scroll state. Direct calls to `pushState()` and `replaceState()` must supply an actual Object type. We need to be able to automatically attach the scroll state to your state object. A new state object has been created, your data has been moved to: `history.state._data`'
                    );
                  }
                }
                state._qRouterScroll = state._qRouterScroll || currentScrollState(scroller);
                return state;
              };
              history.pushState = (state, title, url2) => {
                state = prepareState(state);
                return pushState.call(history, state, title, url2);
              };
              history.replaceState = (state, title, url2) => {
                state = prepareState(state);
                return replaceState2.call(history, state, title, url2);
              };
            }
            document.addEventListener('click', (event) => {
              if (event.defaultPrevented) {
                return;
              }
              const target = event.target.closest('a[href]');
              if (target && !target.hasAttribute('preventdefault:click')) {
                const href = target.getAttribute('href');
                const prev = new URL(location.href);
                const dest = new URL(href, prev);
                if (isSameOrigin(dest, prev) && isSamePath(dest, prev)) {
                  event.preventDefault();
                  if (!dest.hash && !dest.href.endsWith('#')) {
                    if (dest.href !== prev.href) {
                      history.pushState(null, '', dest);
                    }
                    window._qRouterScrollEnabled = false;
                    clearTimeout(window._qRouterScrollDebounce);
                    saveScrollHistory({
                      ...currentScrollState(scroller),
                      x: 0,
                      y: 0,
                    });
                    location.reload();
                    return;
                  }
                  goto(target.getAttribute('href'));
                }
              }
            });
            document.removeEventListener('click', window._qRouterInitAnchors);
            window._qRouterInitAnchors = void 0;
            if (!window.navigation) {
              document.addEventListener(
                'visibilitychange',
                () => {
                  if (
                    (window._qRouterScrollEnabled || window._qCityScrollEnabled) &&
                    document.visibilityState === 'hidden'
                  ) {
                    if (window._qCityScrollEnabled) {
                      console.warn(
                        '"_qCityScrollEnabled" is deprecated. Use "_qRouterScrollEnabled" instead.'
                      );
                    }
                    const scrollState2 = currentScrollState(scroller);
                    saveScrollHistory(scrollState2);
                  }
                },
                { passive: true }
              );
              document.removeEventListener('visibilitychange', window._qRouterInitVisibility);
              window._qRouterInitVisibility = void 0;
            }
            window.addEventListener(
              'scroll',
              () => {
                if (!window._qRouterScrollEnabled && !window._qCityScrollEnabled) {
                  return;
                }
                clearTimeout(window._qRouterScrollDebounce);
                window._qRouterScrollDebounce = setTimeout(() => {
                  const scrollState2 = currentScrollState(scroller);
                  saveScrollHistory(scrollState2);
                  window._qRouterScrollDebounce = void 0;
                }, 200);
              },
              { passive: true }
            );
            removeEventListener('scroll', window._qRouterInitScroll);
            window._qRouterInitScroll = void 0;
            spaInit.resolve();
          }
          if (navType !== 'popstate') {
            window._qRouterScrollEnabled = false;
            clearTimeout(window._qRouterScrollDebounce);
            const scrollState2 = currentScrollState(scroller);
            saveScrollHistory(scrollState2);
          }
          const navigate = () => {
            clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
            contentInternal.trigger();
            return _waitUntilRendered(container2);
          };
          const _waitNextPage = () => {
            if (isServer || props?.viewTransition === false) {
              return navigate();
            } else {
              const viewTransition = startViewTransition({
                update: navigate,
                types: ['qwik-navigation'],
              });
              if (!viewTransition) {
                return Promise.resolve();
              }
              return viewTransition.ready;
            }
          };
          _waitNextPage()
            .catch((err) => {
              navigate();
              throw err;
            })
            .finally(() => {
              container2.element.setAttribute?.(Q_ROUTE, routeName);
              const scrollState2 = currentScrollState(scroller);
              saveScrollHistory(scrollState2);
              window._qRouterScrollEnabled = true;
              if (isBrowser) {
                callRestoreScrollOnDocument();
              }
              if (shouldForcePrevUrl) {
                forceStoreEffects(routeLocation, 'prevUrl');
              }
              if (shouldForceUrl) {
                forceStoreEffects(routeLocation, 'url');
              }
              if (shouldForceParams) {
                forceStoreEffects(routeLocation, 'params');
              }
              routeLocation.isNavigating = false;
              navResolver.r?.();
            });
        }
      }
    }
    if (isServer) {
      return run();
    } else {
      run();
    }
  });
};
const QwikRouterProvider = component$((props) => {
  useQwikRouter(props);
  return /* @__PURE__ */ jsx(Slot, {});
});
const QwikCityProvider = QwikRouterProvider;
const useQwikMockRouter = (props) => {
  const urlEnv = props.url ?? 'http://localhost/';
  const url = new URL(urlEnv);
  const routeLocation = useStore(
    {
      url,
      params: props.params ?? {},
      isNavigating: false,
      prevUrl: void 0,
    },
    { deep: false }
  );
  const loadersData = props.loaders?.reduce((acc, { loader, data }) => {
    acc[loader.__id] = data;
    return acc;
  }, {});
  const loaderState = useStore(loadersData ?? {}, { deep: false });
  const goto =
    props.goto ??
    $(async () => {
      console.warn('QwikRouterMockProvider: goto not provided');
    });
  const documentHead = useStore(createDocumentHead, { deep: false });
  const content = useStore(
    {
      headings: void 0,
      menu: void 0,
    },
    { deep: false }
  );
  const contentInternal = useSignal();
  const actionState = useSignal();
  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteActionContext, actionState);
  const actionsMocks = props.actions?.reduce((acc, { action, handler }) => {
    acc[action.__id] = handler;
    return acc;
  }, {});
  useTask$(async ({ track }) => {
    const action = track(actionState);
    if (!action?.resolve) {
      return;
    }
    const mock = actionsMocks?.[action.id];
    if (mock) {
      const actionResult = await mock(action.data);
      action.resolve(actionResult);
    }
  });
};
const QwikRouterMockProvider = component$((props) => {
  useQwikMockRouter(props);
  return /* @__PURE__ */ jsx(Slot, {});
});
const QwikCityMockProvider = QwikRouterMockProvider;

const RouterOutlet = component$(() => {
  const serverData = useServerData('containerAttributes');
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }
  const internalContext = useContext(ContentInternalContext);
  const contents = internalContext.value;
  if (contents && contents.length > 0) {
    const contentsLen = contents.length;
    let cmp = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      if (contents[i].default) {
        cmp = jsx$1(contents[i].default, {
          children: cmp,
        });
      }
    }
    return /* @__PURE__ */ jsxs(Fragment, {
      children: [
        cmp,
        !__EXPERIMENTAL__.noSPA &&
          /* @__PURE__ */ jsx('script', {
            'document:onQCInit$': spaInit,
            'document:onQInit$': sync$(() => {
              ((w, h) => {
                if (!w._qcs && h.scrollRestoration === 'manual') {
                  w._qcs = true;
                  const s = h.state?._qRouterScroll;
                  if (s) {
                    w.scrollTo(s.x, s.y);
                  }
                  document.dispatchEvent(new Event('qcinit'));
                }
              })(window, history);
            }),
          }),
      ],
    });
  }
  return SkipRender;
});

const routeActionQrl = (actionQrl, ...rest) => {
  const { id, validators } = getValidators(rest, actionQrl);
  function action() {
    const loc = useLocation();
    const currentAction = useAction();
    const initialState = {
      actionPath: `?${QACTION_KEY}=${id}`,
      submitted: false,
      isRunning: false,
      status: void 0,
      value: void 0,
      formData: void 0,
    };
    const state = useStore(() => {
      const value = currentAction.value;
      if (value && value?.id === id) {
        const data = value.data;
        if (data instanceof FormData) {
          initialState.formData = data;
        }
        if (value.output) {
          const { status, result } = value.output;
          initialState.status = status;
          initialState.value = result;
        }
      }
      return initialState;
    });
    const submit = $((input = {}) => {
      if (isServer) {
        throw new Error(`Actions can not be invoked within the server during SSR.
Action.run() can only be called on the browser, for example when a user clicks a button, or submits a form.`);
      }
      let data;
      let form;
      if (input instanceof SubmitEvent) {
        form = input.target;
        data = new FormData(form);
        if (
          (input.submitter instanceof HTMLInputElement ||
            input.submitter instanceof HTMLButtonElement) &&
          input.submitter.name
        ) {
          if (input.submitter.name) {
            data.append(input.submitter.name, input.submitter.value);
          }
        }
      } else {
        data = input;
      }
      return new Promise((resolve) => {
        if (data instanceof FormData) {
          state.formData = data;
        }
        state.submitted = true;
        state.isRunning = true;
        loc.isNavigating = true;
        currentAction.value = {
          data,
          id,
          resolve: noSerialize(resolve),
        };
      }).then(({ result, status }) => {
        state.isRunning = false;
        state.status = status;
        state.value = result;
        if (form) {
          if (form.getAttribute('data-spa-reset') === 'true') {
            form.reset();
          }
          const detail = { status, value: result };
          form.dispatchEvent(
            new CustomEvent('submitcompleted', {
              bubbles: false,
              cancelable: false,
              composed: false,
              detail,
            })
          );
        }
        return {
          status,
          value: result,
        };
      });
    });
    initialState.submit = submit;
    return state;
  }
  action.__brand = 'server_action';
  action.__validators = validators;
  action.__qrl = actionQrl;
  action.__id = id;
  Object.freeze(action);
  return action;
};
const globalActionQrl = (actionQrl, ...rest) => {
  const action = routeActionQrl(actionQrl, ...rest);
  if (isServer) {
    if (typeof globalThis._qwikActionsMap === 'undefined') {
      globalThis._qwikActionsMap = /* @__PURE__ */ new Map();
    }
    globalThis._qwikActionsMap.set(action.__id, action);
  }
  return action;
};
const routeAction$ = /* @__PURE__ */ implicit$FirstArg(routeActionQrl);
const globalAction$ = /* @__PURE__ */ implicit$FirstArg(globalActionQrl);
const getValue = (obj) => obj.value;
const routeLoaderQrl = (loaderQrl, ...rest) => {
  const { id, validators, serializationStrategy } = getValidators(rest, loaderQrl);
  function loader() {
    const state = _resolveContextWithoutSequentialScope(RouteStateContext);
    if (!(id in state)) {
      throw new Error(`routeLoader$ "${loaderQrl.getSymbol()}" was invoked in a route where it was not declared.
    This is because the routeLoader$ was not exported in a 'layout.tsx' or 'index.tsx' file of the existing route.
    For more information check: https://qwik.dev/docs/route-loader/

    If your are managing reusable logic or a library it is essential that this function is re-exported from within 'layout.tsx' or 'index.tsx file of the existing route otherwise it will not run or throw exception.
    For more information check: https://qwik.dev/docs/re-exporting-loaders/`);
    }
    const loaderData = state[id];
    untrack(getValue, loaderData);
    return loaderData;
  }
  loader.__brand = 'server_loader';
  loader.__qrl = loaderQrl;
  loader.__validators = validators;
  loader.__id = id;
  loader.__serializationStrategy = serializationStrategy;
  loader.__expires = -1;
  Object.freeze(loader);
  return loader;
};
const routeLoader$ = /* @__PURE__ */ implicit$FirstArg(routeLoaderQrl);
const validatorQrl = (validator) => {
  if (isServer) {
    return {
      validate: validator,
    };
  }
  return void 0;
};
const validator$ = /* @__PURE__ */ implicit$FirstArg(validatorQrl);
const flattenValibotIssues = (issues) => {
  return issues.reduce((acc, issue) => {
    if (issue.path) {
      const hasArrayType = issue.path.some((path) => path.type === 'array');
      if (hasArrayType) {
        const keySuffix = issue.expected === 'Array' ? '[]' : '';
        const key =
          issue.path
            .map((item) => (item.type === 'array' ? '*' : item.key))
            .join('.')
            .replace(/\.\*/g, '[]') + keySuffix;
        acc[key] = acc[key] || [];
        if (Array.isArray(acc[key])) {
          acc[key].push(issue.message);
        }
        return acc;
      } else {
        acc[issue.path.map((item) => item.key).join('.')] = issue.message;
      }
    }
    return acc;
  }, {});
};
const valibotQrl = (qrl) => {
  if (!__EXPERIMENTAL__.valibot) {
    throw new Error(
      'Valibot is an experimental feature and is not enabled. Please enable the feature flag by adding `experimental: ["valibot"]` to your qwikVite plugin options.'
    );
  }
  if (isServer) {
    return {
      __brand: 'valibot',
      async validate(ev, inputData) {
        const schema = await qrl
          .resolve()
          .then((obj) => (typeof obj === 'function' ? obj(ev) : obj));
        const data = inputData ?? (await ev.parseBody());
        const result = await v.safeParseAsync(schema, data);
        if (result.success) {
          return {
            success: true,
            data: result.output,
          };
        } else {
          if (isDev) {
            console.error('ERROR: Valibot validation failed', result.issues);
          }
          return {
            success: false,
            status: 400,
            error: {
              formErrors: v.flatten(result.issues).root ?? [],
              fieldErrors: flattenValibotIssues(result.issues),
            },
          };
        }
      },
    };
  }
  return void 0;
};
const valibot$ = /* @__PURE__ */ implicit$FirstArg(valibotQrl);
const flattenZodIssues = (issues) => {
  issues = Array.isArray(issues) ? issues : [issues];
  return issues.reduce((acc, issue) => {
    const isExpectingArray = 'expected' in issue && issue.expected === 'array';
    const hasArrayType = issue.path.some((path) => typeof path === 'number') || isExpectingArray;
    if (hasArrayType) {
      const keySuffix = 'expected' in issue && issue.expected === 'array' ? '[]' : '';
      const key =
        issue.path
          .map((path) => (typeof path === 'number' ? '*' : path))
          .join('.')
          .replace(/\.\*/g, '[]') + keySuffix;
      acc[key] = acc[key] || [];
      if (Array.isArray(acc[key])) {
        acc[key].push(issue.message);
      }
      return acc;
    } else {
      acc[issue.path.join('.')] = issue.message;
    }
    return acc;
  }, {});
};
const zodQrl = (qrl) => {
  if (isServer) {
    return {
      __brand: 'zod',
      async validate(ev, inputData) {
        const schema = await qrl.resolve().then((obj) => {
          if (typeof obj === 'function') {
            obj = obj(z, ev);
          }
          if (obj instanceof z.Schema) {
            return obj;
          } else {
            return z.object(obj);
          }
        });
        const data = inputData ?? (await ev.parseBody());
        const result = await withLocale(ev.locale(), () => schema.safeParseAsync(data));
        if (result.success) {
          return result;
        } else {
          if (isDev) {
            console.error('ERROR: Zod validation failed', result.error.issues);
          }
          return {
            success: false,
            status: 400,
            error: {
              formErrors: result.error.flatten().formErrors,
              fieldErrors: flattenZodIssues(result.error.issues),
            },
          };
        }
      },
    };
  }
  return void 0;
};
const zod$ = /* @__PURE__ */ implicit$FirstArg(zodQrl);
const serverQrl = (qrl, options) => {
  if (isServer) {
    const captured = qrl.getCaptured();
    if (captured && captured.length > 0 && !_getContextHostElement()) {
      throw new Error('For security reasons, we cannot serialize QRLs that capture lexical scope.');
    }
  }
  const method = options?.method?.toUpperCase?.() || 'POST';
  const headers = options?.headers || {};
  const origin = options?.origin || '';
  const fetchOptions = options?.fetchOptions || {};
  return $(async function (...args) {
    const abortSignal = args.length > 0 && args[0] instanceof AbortSignal ? args.shift() : void 0;
    if (isServer) {
      let requestEvent = _asyncRequestStore?.getStore();
      if (!requestEvent) {
        const contexts = [useQwikRouterEnv()?.ev, this, _getContextEvent()];
        requestEvent = contexts.find(
          (v2) =>
            v2 &&
            Object.prototype.hasOwnProperty.call(v2, 'sharedMap') &&
            Object.prototype.hasOwnProperty.call(v2, 'cookie')
        );
      }
      return qrl.apply(requestEvent, args);
    } else {
      let filteredArgs = args.map((arg) => {
        if (arg instanceof SubmitEvent && arg.target instanceof HTMLFormElement) {
          return new FormData(arg.target);
        } else if (arg instanceof Event) {
          return null;
        } else if (arg instanceof Node) {
          return null;
        }
        return arg;
      });
      if (!filteredArgs.length) {
        filteredArgs = void 0;
      }
      const qrlHash = qrl.getHash();
      let query = '';
      const config = {
        ...fetchOptions,
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/qwik-json',
          Accept: 'application/json, application/qwik-json, text/qwik-json-stream, text/plain',
          // Required so we don't call accidentally
          'X-QRL': qrlHash,
        },
        signal: abortSignal,
      };
      const captured = qrl.getCaptured();
      let toSend = [filteredArgs];
      if (captured?.length) {
        toSend = [filteredArgs, ...captured];
      } else {
        toSend = filteredArgs ? [filteredArgs] : [];
      }
      const body = await _serialize(toSend);
      if (method === 'GET') {
        query += `&${QDATA_KEY}=${encodeURIComponent(body)}`;
      } else {
        config.body = body;
      }
      const res = await fetch(`${origin}?${QFN_KEY}=${qrlHash}${query}`, config);
      const contentType = res.headers.get('Content-Type');
      if (res.ok && contentType === 'text/qwik-json-stream' && res.body) {
        return (async function* () {
          try {
            for await (const result of deserializeStream(res.body, abortSignal)) {
              yield result;
            }
          } finally {
            if (!abortSignal?.aborted) {
              await res.body.cancel();
            }
          }
        })();
      } else if (contentType === 'application/qwik-json') {
        const str = await res.text();
        const obj = _deserialize(str);
        if (res.status >= 400) {
          throw obj;
        }
        return obj;
      } else if (contentType === 'application/json') {
        const obj = await res.json();
        if (res.status >= 400) {
          throw obj;
        }
        return obj;
      } else if (contentType === 'text/plain' || contentType === 'text/html') {
        const str = await res.text();
        if (res.status >= 400) {
          throw str;
        }
        return str;
      }
    }
  });
};
const server$ = /* @__PURE__ */ implicit$FirstArg(serverQrl);
const getValidators = (rest, qrl) => {
  let id;
  let serializationStrategy = DEFAULT_LOADERS_SERIALIZATION_STRATEGY;
  const validators = [];
  if (rest.length === 1) {
    const options = rest[0];
    if (options && typeof options === 'object') {
      if ('validate' in options) {
        validators.push(options);
      } else {
        id = options.id;
        if (options.serializationStrategy) {
          serializationStrategy = options.serializationStrategy;
        }
        if (options.validation) {
          validators.push(...options.validation);
        }
      }
    }
  } else if (rest.length > 1) {
    validators.push(...rest.filter((v2) => !!v2));
  }
  if (typeof id === 'string') {
    if (isDev) {
      if (!/^[\w/.-]+$/.test(id)) {
        throw new Error(`Invalid id: ${id}, id can only contain [a-zA-Z0-9_.-]`);
      }
    }
    id = `id_${id}`;
  } else {
    id = qrl.getHash();
  }
  return {
    validators: validators.reverse(),
    id,
    serializationStrategy,
  };
};
const deserializeStream = async function* (stream, abortSignal) {
  const reader = stream.getReader();
  try {
    let buffer = '';
    const decoder = new TextDecoder();
    while (!abortSignal?.aborted) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split(/\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const deserializedData = _deserialize(line);
        yield deserializedData;
      }
    }
  } finally {
    reader.releaseLock();
  }
};

const ServiceWorkerRegister = (props) =>
  /* @__PURE__ */ jsx('script', {
    type: 'module',
    dangerouslySetInnerHTML: swRegister,
    nonce: props.nonce,
  });

const Form = ({ action, spaReset, reloadDocument, onSubmit$, ...rest }, key) => {
  if (action) {
    const isArrayApi = Array.isArray(onSubmit$);
    if (isArrayApi) {
      return jsx$1(
        'form',
        {
          ...rest,
          action: action.actionPath,
          'preventdefault:submit': !reloadDocument,
          onSubmit$: [
            ...onSubmit$,
            // action.submit "submitcompleted" event for onSubmitCompleted$ events
            !reloadDocument
              ? $((evt) => {
                  if (!action.submitted) {
                    return action.submit(evt);
                  }
                })
              : void 0,
          ],
          method: 'post',
          ['data-spa-reset']: spaReset ? 'true' : void 0,
        },
        key
      );
    }
    return jsx$1(
      'form',
      {
        ...rest,
        action: action.actionPath,
        'preventdefault:submit': !reloadDocument,
        onSubmit$: [
          // Since v2, this fires before the action is executed so it can be prevented
          onSubmit$,
          // action.submit "submitcompleted" event for onSubmitCompleted$ events
          !reloadDocument ? action.submit : void 0,
        ],
        method: 'post',
        ['data-spa-reset']: spaReset ? 'true' : void 0,
      },
      key
    );
  } else {
    return /* @__PURE__ */ jsx(
      GetForm,
      {
        spaReset,
        reloadDocument,
        onSubmit$,
        ...rest,
      },
      key
    );
  }
};
const GetForm = component$(({ action: _0, spaReset, reloadDocument, onSubmit$, ...rest }) => {
  const nav = useNavigate();
  return /* @__PURE__ */ jsx('form', {
    action: 'get',
    'preventdefault:submit': !reloadDocument,
    'data-spa-reset': spaReset ? 'true' : void 0,
    ...rest,
    onSubmit$: [
      ...(Array.isArray(onSubmit$) ? onSubmit$ : [onSubmit$]),
      $(async (_evt, form) => {
        const formData = new FormData(form);
        const params = new URLSearchParams();
        formData.forEach((value, key) => {
          if (typeof value === 'string') {
            params.append(key, value);
          }
        });
        await nav('?' + params.toString(), { type: 'form', forceReload: true });
      }),
      $((_evt, form) => {
        if (form.getAttribute('data-spa-reset') === 'true') {
          form.reset();
        }
        form.dispatchEvent(
          new CustomEvent('submitcompleted', {
            bubbles: false,
            cancelable: false,
            composed: false,
            detail: {
              status: 200,
            },
          })
        );
      }),
      // end of array
    ],
    children: /* @__PURE__ */ jsx(Slot, {}),
  });
});

const untypedAppUrl = function appUrl(route, params, paramsPrefix = '') {
  const path = route.split('/');
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const isSpread = segment.startsWith('[...');
      const key = segment.substring(segment.startsWith('[...') ? 4 : 1, segment.length - 1);
      const value = params ? params[paramsPrefix + key] || params[key] : '';
      path[i] = isSpread ? value : encodeURIComponent(value);
    }
    if (segment.startsWith('(') && segment.endsWith(')')) {
      path.splice(i, 1);
    }
  }
  let url = path.join('/');
  let baseURL = '/';
  if (baseURL) {
    if (!baseURL.endsWith('/')) {
      baseURL += '/';
    }
    while (url.startsWith('/')) {
      url = url.substring(1);
    }
    url = baseURL + url;
  }
  return url;
};
function omitProps(obj, keys) {
  const omittedObj = {};
  for (const key in obj) {
    if (!key.startsWith('param:') && !keys.includes(key)) {
      omittedObj[key] = obj[key];
    }
  }
  return omittedObj;
}

const createRenderer = (getOptions) => {
  return (opts) => {
    const { jsx, options } = getOptions(opts);
    return renderToStream(jsx, options);
  };
};

const DocumentHeadTags = component$((props) => {
  let head = useDocumentHead();
  if (props) {
    head = { ...head, ...props };
  }
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      head.title && /* @__PURE__ */ jsx('title', { children: head.title }),
      head.meta.map((m) => /* @__PURE__ */ jsx('meta', { ...m })),
      head.links.map((l) => /* @__PURE__ */ jsx('link', { ...l })),
      head.styles.map((s) => {
        const props2 = s.props || s;
        return /* @__PURE__ */ createElement('style', {
          ...props2,
          dangerouslySetInnerHTML: s.style || props2.dangerouslySetInnerHTML,
          key: s.key,
        });
      }),
      head.scripts.map((s) => {
        const props2 = s.props || s;
        return /* @__PURE__ */ createElement('script', {
          ...props2,
          dangerouslySetInnerHTML: s.script || props2.dangerouslySetInnerHTML,
          key: s.key,
        });
      }),
    ],
  });
});

export {
  DocumentHeadTags,
  ErrorBoundary,
  Form,
  Link,
  QWIK_CITY_SCROLLER,
  QWIK_ROUTER_SCROLLER,
  QwikCityMockProvider,
  QwikCityProvider,
  QwikRouterMockProvider,
  QwikRouterProvider,
  RouterOutlet,
  ServiceWorkerRegister,
  createRenderer,
  globalAction$,
  globalActionQrl,
  omitProps,
  routeAction$,
  routeActionQrl,
  routeLoader$,
  routeLoaderQrl,
  server$,
  serverQrl,
  untypedAppUrl,
  useContent,
  useDocumentHead,
  useLocation,
  useNavigate,
  usePreventNavigate$,
  usePreventNavigateQrl,
  useQwikRouter,
  valibot$,
  valibotQrl,
  validator$,
  validatorQrl,
  zod$,
  zodQrl,
};
