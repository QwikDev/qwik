import {
  componentQrl,
  inlinedQrl,
  useErrorBoundary,
  useOnWindow,
  _captures,
  _jsxSorted,
  Slot,
  isBrowser,
  useSignal,
  untrack,
  _qrlSync,
  useVisibleTaskQrl,
  isDev,
  _jsxSplit,
  _getConstProps,
  _getVarProps,
  eventQrl,
  isServer,
  useStylesQrl,
  useServerData,
  useStore,
  useContextProvider,
  useTaskQrl,
  getLocale,
  noSerialize,
  useContext,
  SkipRender,
  implicit$FirstArg,
  withLocale,
  _wrapProp,
  _restProps,
  _fnSignal,
  createElement,
} from '@qwik.dev/core';
import { Fragment } from '@qwik.dev/core/jsx-runtime';
import * as qwikRouterConfig from '@qwik-router-config';
import { p } from '@qwik.dev/core/preloader';
import {
  l as loadRoute,
  g as getClientNavPath,
  s as shouldPreload,
  i as isSamePath,
  t as toPath,
  c as createDocumentHead,
  r as resolveHead,
  a as isSameOrigin,
  b as toUrl,
} from './chunks/head.qwik.mjs';
import {
  u as useNavigate,
  a as useLocation,
  b as useDocumentHead,
  c as useQwikRouterEnv,
  d as useAction,
} from './chunks/use-functions.qwik.mjs';
export {
  e as useContent,
  f as useHttpStatus,
  g as usePreventNavigate$,
  h as usePreventNavigateQrl,
} from './chunks/use-functions.qwik.mjs';
import {
  _deserialize,
  _getContextContainer,
  _hasStoreEffects,
  _retryOnPromise,
  forceStoreEffects,
  createAsyncQrl,
  _waitUntilRendered,
  _getContextHostElement,
  _serialize,
} from '@qwik.dev/core/internal';
import {
  Q as QACTION_KEY,
  e as ensureRouteLoaderSignals,
  s as setLoaderSignalValue,
  C as ContentContext,
  a as ContentInternalContext,
  D as DocumentHeadContext,
  H as HttpStatusContext,
  R as RouteLocationContext,
  b as RouteNavigateContext,
  c as RouteStateContext,
  d as RouteLoaderCtxContext,
  f as RouteActionContext,
  g as RoutePreventNavigateContext,
  u as updateRouteLoaderCtx,
  h as Q_ROUTE,
  i as getRequestEvent,
  j as QFN_KEY,
  k as QDATA_KEY,
} from './chunks/route-loaders.qwik.mjs';
export { r as routeLoader$, l as routeLoaderQrl } from './chunks/route-loaders.qwik.mjs';
import * as v from 'valibot';
import * as z from 'zod';
export { z } from 'zod';
import swRegister from '@qwik-router-sw-register';
import { renderToStream } from '@qwik.dev/core/server';

const ErrorBoundary = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((props) => {
    const store = useErrorBoundary();
    useOnWindow(
      'qerror',
      /* @__PURE__ */ inlinedQrl(
        (e) => {
          const store2 = _captures[0];
          store2.error = e.detail.error;
        },
        'ErrorBoundary_component_useOnWindow_G0jFRpoNY0M',
        [store]
      )
    );
    if (store.error && props.fallback$) {
      return /* @__PURE__ */ _jsxSorted(
        Fragment,
        null,
        null,
        props.fallback$(store.error),
        1,
        'bA_0'
      );
    }
    return /* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, 'bA_1');
  }, 'ErrorBoundary_component_pOa6vjtC7ik')
);

async function prefetchRoute(url, prefetchData, probability = 0.8, manifestHash) {
  if (!isBrowser) {
    return;
  }
  try {
    const loadedRoute = await loadRoute(
      qwikRouterConfig.routes,
      qwikRouterConfig.cacheModules,
      url.pathname
    );
    if (!loadedRoute) {
      return;
    }
    let routeName = loadedRoute.$routeName$;
    routeName = routeName.endsWith('/') ? routeName : routeName + '/';
    if (routeName.length > 1 && routeName.startsWith('/')) {
      routeName = routeName.slice(1);
    }
    p(routeName, probability);
    if (!prefetchData || !manifestHash) {
      return;
    }
    if (loadedRoute.$loaders$?.length && loadedRoute.$loaderPaths$) {
      const basePath = qwikRouterConfig.basePathname ?? '/';
      for (const hash of loadedRoute.$loaders$) {
        let loaderPath = loadedRoute.$loaderPaths$?.[hash];
        if (!loaderPath) {
          continue;
        }
        if (basePath !== '/' && !loaderPath.startsWith(basePath)) {
          loaderPath = basePath + loaderPath.slice(1);
        }
        const pathBase = loaderPath.endsWith('/') ? loaderPath : loaderPath + '/';
        const fetchUrl = `${pathBase}q-loader-${hash}.${manifestHash}.json`;
        fetch(fetchUrl)
          .then((r) => r.blob())
          .catch(() => {});
      }
    }
  } catch {}
}

const Link = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((props) => {
    const nav = useNavigate();
    const loc = useLocation();
    const head = useDocumentHead();
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
    const clientNavPath = untrack(
      getClientNavPath,
      {
        ...linkProps,
        reload,
      },
      loc
    );
    linkProps.href = clientNavPath || originalHref;
    const prefetchData =
      (!!clientNavPath && prefetchProp !== false && prefetchProp !== 'js') || void 0;
    const prefetch =
      prefetchData ||
      (!!clientNavPath && prefetchProp !== false && untrack(shouldPreload, clientNavPath, loc));
    const handlePrefetch = prefetch
      ? /* @__PURE__ */ inlinedQrl(
          (_, elm) => {
            const head2 = _captures[0];
            if (navigator.connection?.saveData) {
              return;
            }
            if (elm && elm.href) {
              const url = new URL(elm.href);
              prefetchRoute(url, elm.hasAttribute('data-prefetch'), 0.8, head2.manifestHash);
            }
          },
          'Link_component_handlePrefetch_AGvVXzXKbms',
          [head]
        )
      : void 0;
    const preventDefault = clientNavPath
      ? _qrlSync((event) => {
          if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
            event.preventDefault();
          }
        }, 'event=>{if(!(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)){event.preventDefault();}}')
      : void 0;
    const handleClientSideNavigation = clientNavPath
      ? /* @__PURE__ */ inlinedQrl(
          (event, elm) => {
            const nav2 = _captures[0],
              reload2 = _captures[1],
              replaceState2 = _captures[2],
              scroll2 = _captures[3];
            if (event.defaultPrevented) {
              if (elm.href) {
                elm.setAttribute('aria-pressed', 'true');
                nav2(elm.href, {
                  forceReload: reload2,
                  replaceState: replaceState2,
                  scroll: scroll2,
                }).then(() => {
                  elm.removeAttribute('aria-pressed');
                });
              }
            }
          },
          'Link_component_handleClientSideNavigation_h3qenoGeI6M',
          [nav, reload, replaceState, scroll]
        )
      : void 0;
    const handlePreload = /* @__PURE__ */ inlinedQrl((_, elm) => {
      const url = new URL(elm.href);
      prefetchRoute(url.pathname, false, 1);
    }, 'Link_component_handlePreload_AAemwtuBjsE');
    useVisibleTaskQrl(
      /* @__PURE__ */ inlinedQrl(
        ({ track }) => {
          const anchorRef2 = _captures[0],
            handlePrefetch2 = _captures[1],
            linkProps2 = _captures[2],
            loc2 = _captures[3];
          track(() => loc2.url.pathname);
          const handler = linkProps2.onQVisible$;
          if (handler) {
            const event = new CustomEvent('qvisible');
            if (Array.isArray(handler)) {
              handler.flat(10).forEach((handler2) => handler2?.(event, anchorRef2.value));
            } else {
              handler?.(event, anchorRef2.value);
            }
          }
          if (!isDev && anchorRef2.value) {
            handlePrefetch2?.(void 0, anchorRef2.value);
          }
        },
        'Link_component_useVisibleTask_xKeuRmnoNSA',
        [anchorRef, handlePrefetch, linkProps, loc]
      )
    );
    return /* @__PURE__ */ _jsxSplit(
      'a',
      {
        ref: anchorRef,
        'q:link': !!clientNavPath,
        ..._getVarProps(linkProps),
        ..._getConstProps(linkProps),
        'q-e:click': [preventDefault, handlePreload, onClick$, handleClientSideNavigation],
        'data-prefetch': prefetchData,
        'q-e:mouseover': [linkProps.onMouseOver$, handlePrefetch],
        'q-e:focus': [linkProps.onFocus$, handlePrefetch],
      },
      {
        // We need to prevent the onQVisible$ from being called twice since it is handled in the visible task
        'q-e:qvisible': [],
      },
      /* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, 'jO_0'),
      0,
      'jO_1'
    );
  }, 'Link_component_VPmar9tb3t4')
);

const newScrollState = () => {
  return {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
};
const clientNavigate = (win, navType, fromURL, toURL, replaceState = false) => {
  if (navType !== 'popstate') {
    const samePath = isSamePath(fromURL, toURL);
    const sameHash = fromURL.hash === toURL.hash;
    if (!samePath || !sameHash) {
      const newState = {
        _qRouterScroll: newScrollState(),
      };
      if (replaceState) {
        win.history.replaceState(newState, '', toPath(toURL));
      } else {
        win.history.pushState(newState, '', toPath(toURL));
      }
    }
  }
};

const transitionCss =
  '@layer qwik{@supports selector(html:active-view-transition-type(type)){html:active-view-transition-type(qwik-navigation){:root{view-transition-name:none}}}@supports not selector(html:active-view-transition-type(type)){:root{view-transition-name:none}}}';

function callRestoreScrollOnDocument() {
  if (document.__q_scroll_restore__) {
    document.__q_scroll_restore__();
    document.__q_scroll_restore__ = void 0;
  }
}
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
const restoreScroll = (type, toUrl, fromUrl, scroller, scrollState) => {
  if (type === 'popstate' && scrollState) {
    scroller.scrollTo(scrollState.x, scrollState.y);
  } else if (type === 'link' || type === 'form') {
    if (!hashScroll(toUrl, fromUrl)) {
      scroller.scrollTo(0, 0);
    }
  }
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

const spaInit = eventQrl(
  /* @__PURE__ */ inlinedQrl((_, el) => {
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
            id: 'qr-n',
          });
          if (nav) {
            nav(location.href, {
              type: 'popstate',
            });
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
            state = {
              _data: state,
            };
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
                saveScrollState({
                  ...currentScrollState(),
                  x: 0,
                  y: 0,
                });
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
        window.addEventListener('scroll', window._qRouterInitScroll, {
          passive: true,
        });
        document.addEventListener('click', window._qRouterInitAnchors);
        if (!window.navigation) {
          document.addEventListener('visibilitychange', window._qRouterInitVisibility, {
            passive: true,
          });
        }
      }, 0);
    }
  }, 'spa_init_event_igI1pUsax0E')
);

async function submitAction(action, routePath) {
  const pathBase = routePath.endsWith('/') ? routePath : routePath + '/';
  const url = `${pathBase}?${QACTION_KEY}=${encodeURIComponent(action.id)}`;
  const actionData = action.data;
  let fetchOptions;
  if (actionData instanceof FormData) {
    fetchOptions = {
      method: 'POST',
      body: actionData,
      headers: {
        Accept: 'application/json',
      },
    };
  } else {
    fetchOptions = {
      method: 'POST',
      body: JSON.stringify(actionData),
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
    };
  }
  const response = await fetch(url, fetchOptions);
  if (response.redirected) {
    const redirectedURL = new URL(response.url);
    if (redirectedURL.origin !== location.origin) {
      location.href = redirectedURL.href;
      return void 0;
    }
    location.href = redirectedURL.href;
    return void 0;
  }
  if ((response.headers.get('content-type') || '').includes('json')) {
    const text = await response.text();
    const data = _deserialize(text);
    return {
      status: response.status,
      result: data?.result,
      loaderHashes: data?.loaderHashes,
      loaderValues: data?.loaders,
    };
  }
  return void 0;
}

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
    const event = new CustomEvent('qviewtransition', {
      detail: transition,
    });
    document.dispatchEvent(event);
    return transition;
  } else {
    params.update?.();
  }
};

const QWIK_CITY_SCROLLER = '_qCityScroller';
const QWIK_ROUTER_SCROLLER = '_qRouterScroller';
const preventNav = {};
const internalState = {
  navCount: 0,
  redirectCount: 0,
};
const useQwikRouter = (props) => {
  if (!isServer) {
    throw new Error(
      'useQwikRouter can only run during SSR on the server. If you are seeing this, it means you are re-rendering the root of your application. Fix that or use the <QwikRouterProvider> component around the root of your application.'
    );
  }
  useStylesQrl(
    /* @__PURE__ */ inlinedQrl(transitionCss, 'qwik_view_transition_css_inline_vNfd9raIMI0')
  );
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
  const manifestHash = useServerData('containerAttributes')?.['q:manifest-hash'];
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
  const routeLocation = useStore(routeLocationTarget, {
    deep: false,
  });
  const navResolver = {};
  env.routeLoaderCtx.manifestHash = manifestHash || '';
  env.routeLoaderCtx.pageUrl = url;
  const routeLoaderCtx = useStore(env.routeLoaderCtx);
  const loaderState = useStore(
    {},
    {
      deep: false,
    }
  );
  const contentModulesForInit = env.loadedRoute.$mods$;
  const loaders = ensureRouteLoaderSignals(contentModulesForInit, loaderState, routeLoaderCtx);
  for (const loader of loaders) {
    const value = env.loaderValues[loader.__id];
    if (value !== void 0) {
      setLoaderSignalValue(loaderState[loader.__id], value);
    }
  }
  const routeInternal = useSignal({
    type: 'initial',
    dest: url,
    scroll: true,
  });
  const documentHead = useStore(() => createDocumentHead(serverHead, manifestHash));
  const content = useStore({
    headings: void 0,
    menu: void 0,
  });
  const contentInternal = useSignal();
  const httpStatus = useSignal({
    status: env.response.status,
    message: env.loadedRoute.$notFound$ ? 'Not Found' : (env.response.statusMessage ?? ''),
  });
  const currentActionId = env.response.action;
  const currentAction = currentActionId ? env.response.actionResult : void 0;
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
  const registerPreventNav = /* @__PURE__ */ inlinedQrl((fn$) => {
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
  }, 'useQwikRouter_registerPreventNav_69B0DK0eZJc');
  const getScroller = /* @__PURE__ */ inlinedQrl(() => {
    let scroller = document.getElementById(QWIK_ROUTER_SCROLLER);
    if (!scroller) {
      scroller = document.getElementById(QWIK_CITY_SCROLLER);
      if (scroller && isDev) {
        console.warn(
          `Please update your scroller ID to "${QWIK_ROUTER_SCROLLER}" as "${QWIK_CITY_SCROLLER}" is deprecated and will be removed in V3`
        );
      }
    }
    return scroller ?? document.documentElement;
  }, 'useQwikRouter_getScroller_0UhDFwlxeFQ');
  const goto = /* @__PURE__ */ inlinedQrl(
    async (path, opt) => {
      const actionState2 = _captures[0],
        getScroller2 = _captures[1],
        manifestHash2 = _captures[2],
        navResolver2 = _captures[3],
        routeInternal2 = _captures[4],
        routeLocation2 = _captures[5];
      const {
        type = 'link',
        forceReload = path === void 0,
        replaceState = false,
        scroll = true,
      } = typeof opt === 'object'
        ? opt
        : {
            forceReload: opt,
          };
      internalState.navCount++;
      if (isBrowser && type === 'link' && routeInternal2.value.type === 'initial') {
        const url2 = new URL(window.location.href);
        routeInternal2.value.dest = url2;
        routeLocation2.url = url2;
      }
      const lastDest = routeInternal2.value.dest;
      const dest =
        path === void 0
          ? lastDest
          : typeof path === 'number'
            ? path
            : toUrl(path, routeLocation2.url);
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
          const scroller = await getScroller2();
          restoreScroll(type, dest, new URL(location.href), scroller, getScrollHistory());
          if (type === 'popstate') {
            window._qRouterScrollEnabled = true;
          }
        }
        if (dest.href !== routeLocation2.url.href) {
          const newUrl = new URL(dest.href);
          routeInternal2.value.dest = newUrl;
          routeLocation2.url = newUrl;
        }
        return;
      }
      let historyUpdated = false;
      if (isBrowser && type === 'link' && !forceReload) {
        const scroller = await getScroller2();
        window._qRouterScrollEnabled = false;
        clearTimeout(window._qRouterScrollDebounce);
        const scrollState = currentScrollState(scroller);
        saveScrollHistory(scrollState);
        clientNavigate(window, type, new URL(location.href), dest, replaceState);
        historyUpdated = true;
      }
      routeInternal2.value = {
        type,
        dest,
        forceReload,
        replaceState,
        scroll,
        historyUpdated,
      };
      if (isBrowser) {
        prefetchRoute(dest, true, 0.8, manifestHash2);
      }
      actionState2.value = void 0;
      routeLocation2.isNavigating = true;
      return new Promise((resolve) => {
        navResolver2.r = resolve;
      });
    },
    'useQwikRouter_goto_8j8Vrz2yUIM',
    [actionState, getScroller, manifestHash, navResolver, routeInternal, routeLocation]
  );
  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(HttpStatusContext, httpStatus);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteLoaderCtxContext, routeLoaderCtx);
  routeLoaderCtx.goto = goto;
  useContextProvider(RouteActionContext, actionState);
  useContextProvider(RoutePreventNavigateContext, registerPreventNav);
  useTaskQrl(
    /* @__PURE__ */ inlinedQrl(
      async ({ track }) => {
        const actionState2 = _captures[0],
          content2 = _captures[1],
          contentInternal2 = _captures[2],
          documentHead2 = _captures[3],
          env2 = _captures[4],
          getScroller2 = _captures[5],
          goto2 = _captures[6],
          httpStatus2 = _captures[7],
          loaderState2 = _captures[8],
          navResolver2 = _captures[9],
          props2 = _captures[10],
          routeInternal2 = _captures[11],
          routeLoaderCtx2 = _captures[12],
          routeLocation2 = _captures[13],
          routeLocationTarget2 = _captures[14],
          serverHead2 = _captures[15];
        const container = _getContextContainer();
        const navigation = track(routeInternal2);
        const action = track(actionState2);
        const locale = getLocale('');
        const prevUrl = routeLocation2.url;
        const navType = action ? 'form' : navigation.type;
        const replaceState = navigation.replaceState;
        let trackUrl;
        let endpointResponse;
        let actionData;
        let loadedRoute;
        if (isServer) {
          trackUrl = new URL(navigation.dest, routeLocation2.url);
          loadedRoute = env2.loadedRoute;
          endpointResponse = env2.response;
          actionData = endpointResponse;
        } else {
          trackUrl = new URL(navigation.dest, location);
          if (trackUrl.pathname.endsWith('/')) {
            if (globalThis.__NO_TRAILING_SLASH__) {
              trackUrl.pathname = trackUrl.pathname.slice(0, -1);
            }
          } else if (!globalThis.__NO_TRAILING_SLASH__) {
            trackUrl.pathname += '/';
          }
          const loadRoutePromise = loadRoute(
            qwikRouterConfig.routes,
            qwikRouterConfig.cacheModules,
            trackUrl.pathname
          );
          try {
            loadedRoute = await loadRoutePromise;
          } catch (e) {
            console.error(e);
            window.location.href = trackUrl.href;
            return;
          }
          if (action) {
            const result = await submitAction(action, trackUrl.pathname);
            if (!result) {
              routeInternal2.untrackedValue = {
                type: navType,
                dest: trackUrl,
              };
              return;
            }
            actionData = {
              status: result.status,
              action: action.id,
              actionResult: result.result,
            };
            if (action.resolve) {
              action.resolve({
                status: result.status,
                result: result.result,
              });
            }
            if (result.loaderValues && Object.keys(result.loaderValues).length > 0) {
              for (const [id, value] of Object.entries(result.loaderValues)) {
                const signal = loaderState2[id];
                if (signal) {
                  setLoaderSignalValue(signal, value);
                }
              }
            }
            if (result.loaderHashes) {
              for (const hash of result.loaderHashes) {
                loaderState2[hash]?.invalidate(true);
              }
            }
          }
        }
        const { $routeName$, $params$, $mods$, $menu$, $notFound$ } = loadedRoute;
        const contentModules = $mods$;
        updateRouteLoaderCtx(routeLoaderCtx2, loadedRoute.$loaderPaths$, trackUrl);
        const routeLoaders = ensureRouteLoaderSignals(
          contentModules,
          loaderState2,
          routeLoaderCtx2
        );
        const navCountBefore = internalState.navCount;
        if (!isServer && routeLoaders.length > 0) {
          await Promise.all(routeLoaders.map((loader) => loaderState2[loader.__id]?.promise()));
        }
        if (internalState.navCount !== navCountBefore) {
          if (++internalState.redirectCount > 20) {
            console.error('Too many redirects, aborting navigation');
            internalState.redirectCount = 0;
            return;
          }
          return;
        }
        internalState.redirectCount = 0;
        if ($notFound$) {
          httpStatus2.value = {
            status: 404,
            message: 'Not Found',
          };
        } else if (endpointResponse) {
          httpStatus2.value = {
            status: endpointResponse.status,
            message: endpointResponse.statusMessage ?? 'OK',
          };
        } else if (actionData) {
          httpStatus2.value = {
            status: actionData.status,
            message: 'OK',
          };
        } else {
          httpStatus2.value = {
            status: 200,
            message: 'OK',
          };
        }
        const pageModule = contentModules[contentModules.length - 1];
        if (navigation.dest.search && !!isSamePath(trackUrl, prevUrl)) {
          trackUrl.search = navigation.dest.search;
        }
        let shouldForcePrevUrl = false;
        let shouldForceUrl = false;
        let shouldForceParams = false;
        if (!isSamePath(trackUrl, prevUrl)) {
          if (_hasStoreEffects(routeLocation2, 'prevUrl')) {
            shouldForcePrevUrl = true;
          }
          routeLocationTarget2.prevUrl = prevUrl;
        }
        if (routeLocationTarget2.url !== trackUrl) {
          if (_hasStoreEffects(routeLocation2, 'url')) {
            shouldForceUrl = true;
          }
          routeLocationTarget2.url = trackUrl;
        }
        if (routeLocationTarget2.params !== $params$) {
          if (_hasStoreEffects(routeLocation2, 'params')) {
            shouldForceParams = true;
          }
          routeLocationTarget2.params = $params$;
        }
        routeInternal2.untrackedValue = {
          type: navType,
          dest: trackUrl,
        };
        const resolvedHead = await _retryOnPromise(() =>
          resolveHead(actionData, loaderState2, routeLocation2, contentModules, locale, serverHead2)
        );
        content2.headings = pageModule.headings;
        content2.menu = $menu$;
        contentInternal2.untrackedValue = noSerialize(contentModules);
        documentHead2.links = resolvedHead.links;
        documentHead2.meta = resolvedHead.meta;
        documentHead2.styles = resolvedHead.styles;
        documentHead2.scripts = resolvedHead.scripts;
        documentHead2.title = resolvedHead.title;
        documentHead2.frontmatter = resolvedHead.frontmatter;
        if (isBrowser) {
          let scrollState;
          if (navType === 'popstate') {
            scrollState = getScrollHistory();
          }
          const scroller = await getScroller2();
          if (
            (navigation.scroll &&
              (!navigation.forceReload || !isSamePath(trackUrl, prevUrl)) &&
              (navType === 'link' || navType === 'popstate')) ||
            (navType === 'form' && !isSamePath(trackUrl, prevUrl))
          ) {
            document.__q_scroll_restore__ = () =>
              restoreScroll(navType, trackUrl, prevUrl, scroller, scrollState);
          }
          if (!window._qRouterSPA) {
            window._qRouterSPA = true;
            history.scrollRestoration = 'manual';
            window.addEventListener('popstate', () => {
              window._qRouterScrollEnabled = false;
              clearTimeout(window._qRouterScrollDebounce);
              goto2(location.href, {
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
                  state = {
                    _data: state,
                  };
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
                  goto2(target.getAttribute('href'));
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
                {
                  passive: true,
                }
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
              {
                passive: true,
              }
            );
            removeEventListener('scroll', window._qRouterInitScroll);
            window._qRouterInitScroll = void 0;
            spaInit.resolve();
          }
          if (navType !== 'popstate') {
            window._qRouterScrollEnabled = false;
            clearTimeout(window._qRouterScrollDebounce);
            if (!navigation.historyUpdated) {
              const scrollState2 = currentScrollState(scroller);
              saveScrollHistory(scrollState2);
            }
          }
          const navigate = () => {
            if (navigation.historyUpdated) {
              const currentPath = location.pathname + location.search + location.hash;
              const nextPath = toPath(trackUrl);
              if (currentPath !== nextPath) {
                history.replaceState(history.state, '', nextPath);
              }
            } else {
              clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
            }
            contentInternal2.trigger();
            return _waitUntilRendered(container);
          };
          const _waitNextPage = () => {
            if (isServer || props2?.viewTransition === false) {
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
              container.element.setAttribute?.(Q_ROUTE, $routeName$);
              const scrollState2 = currentScrollState(scroller);
              saveScrollHistory(scrollState2);
              window._qRouterScrollEnabled = true;
              if (isBrowser) {
                callRestoreScrollOnDocument();
              }
              if (shouldForcePrevUrl) {
                forceStoreEffects(routeLocation2, 'prevUrl');
              }
              if (shouldForceUrl) {
                forceStoreEffects(routeLocation2, 'url');
              }
              if (shouldForceParams) {
                forceStoreEffects(routeLocation2, 'params');
              }
              routeLocation2.isNavigating = false;
              navResolver2.r?.();
            });
        }
      },
      'useQwikRouter_useTask_XpalYii770E',
      [
        actionState,
        content,
        contentInternal,
        documentHead,
        env,
        getScroller,
        goto,
        httpStatus,
        loaderState,
        navResolver,
        props,
        routeInternal,
        routeLoaderCtx,
        routeLocation,
        routeLocationTarget,
        serverHead,
      ]
    ),
    // We should only wait for navigation to complete on the server
    {
      deferUpdates: isServer,
    }
  );
};
const QwikRouterProvider = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((props) => {
    useQwikRouter(props);
    return /* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, '5y_0');
  }, 'QwikRouterProvider_component_6Kjfa79mqlY')
);
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
    {
      deep: false,
    }
  );
  const loadersData = props.loaders?.reduce((acc, { loader, data }) => {
    acc[loader.__id] = data;
    return acc;
  }, {});
  const loaderState = useStore(
    {},
    {
      deep: false,
    }
  );
  for (const [loaderId, data] of Object.entries(loadersData ?? {})) {
    loaderState[loaderId] ||= createAsyncQrl(
      /* @__PURE__ */ inlinedQrl(
        async () => {
          const data2 = _captures[0];
          return data2;
        },
        'useQwikMockRouter_createAsync_clbxpuXqpEU',
        [data]
      ),
      {
        initial: data,
      }
    );
  }
  const goto =
    props.goto ??
    /* @__PURE__ */ inlinedQrl(async () => {
      console.warn('QwikRouterMockProvider: goto not provided');
    }, 'useQwikMockRouter_goto_aViHFxQ1a3s');
  const documentHead = useStore(createDocumentHead, {
    deep: false,
  });
  const content = useStore(
    {
      headings: void 0,
      menu: void 0,
    },
    {
      deep: false,
    }
  );
  const contentInternal = useSignal();
  const actionState = useSignal();
  const httpStatus = useSignal({
    status: 200,
    message: '',
  });
  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(HttpStatusContext, httpStatus);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteActionContext, actionState);
  const actionsMocks = props.actions?.reduce((acc, { action, handler }) => {
    acc[action.__id] = handler;
    return acc;
  }, {});
  useTaskQrl(
    /* @__PURE__ */ inlinedQrl(
      async ({ track }) => {
        const actionState2 = _captures[0],
          actionsMocks2 = _captures[1];
        const action = track(actionState2);
        if (!action?.resolve) {
          return;
        }
        const mock = actionsMocks2?.[action.id];
        if (mock) {
          const actionResult = await mock(action.data);
          action.resolve(actionResult);
        }
      },
      'useQwikMockRouter_useTask_tXTLR4tzCy0',
      [actionState, actionsMocks]
    )
  );
};
const QwikRouterMockProvider = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((props) => {
    useQwikMockRouter(props);
    return /* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, '5y_1');
  }, 'QwikRouterMockProvider_component_IN4dVpT0x74')
);
const QwikCityMockProvider = QwikRouterMockProvider;

const RouterOutlet = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl(() => {
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
          cmp = _jsxSorted(contents[i].default, null, null, cmp, 1, 'Fn_0');
        }
      }
      return /* @__PURE__ */ _jsxSorted(
        Fragment,
        null,
        null,
        [
          cmp,
          !__EXPERIMENTAL__.noSPA &&
            /* @__PURE__ */ _jsxSorted(
              'script',
              {
                'q-d:qinit': _qrlSync(() => {
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
                }, '()=>{((w,h)=>{if(!w._qcs&&h.scrollRestoration==="manual"){w._qcs=!0;const s=h.state?._qRouterScroll;if(s){w.scrollTo(s.x,s.y);}document.dispatchEvent(new Event("qcinit"));}})(window,history);}'),
              },
              {
                'q-d:qcinit': spaInit,
              },
              null,
              2,
              'Fn_1'
            ),
        ],
        1,
        'Fn_2'
      );
    }
    return SkipRender;
  }, 'RouterOutlet_component_QwONcWD5gIg')
);

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
const getValidators = (rest, qrl) => {
  let id;
  let invalidate;
  const validators = [];
  if (rest.length === 1) {
    const options = rest[0];
    if (options && typeof options === 'object') {
      if ('validate' in options) {
        validators.push(options);
      } else {
        id = options.id;
        if (options.validation) {
          validators.push(...options.validation);
        }
        if (options.invalidate) {
          invalidate = options.invalidate.map((loader) => loader.__id);
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
    invalidate,
  };
};
const routeActionQrl = (actionQrl, ...rest) => {
  const { id, validators, invalidate } = getValidators(rest, actionQrl);
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
    const submit = /* @__PURE__ */ inlinedQrl(
      (input = {}) => {
        const currentAction2 = _captures[0],
          id2 = _captures[1],
          loc2 = _captures[2],
          state2 = _captures[3];
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
            state2.formData = data;
          }
          state2.submitted = true;
          state2.isRunning = true;
          loc2.isNavigating = true;
          currentAction2.value = {
            data,
            id: id2,
            resolve: noSerialize(resolve),
          };
        }).then((_rawProps) => {
          state2.isRunning = false;
          state2.status = _rawProps.status;
          state2.value = _rawProps.result;
          if (form) {
            if (form.getAttribute('data-spa-reset') === 'true') {
              form.reset();
            }
            const detail = {
              status: _rawProps.status,
              value: _rawProps.result,
            };
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
            status: _rawProps.status,
            value: _rawProps.result,
          };
        });
      },
      'routeActionQrl_action_submit_YuS5bpdQ360',
      [currentAction, id, loc, state]
    );
    initialState.submit = submit;
    return state;
  }
  action.__brand = 'server_action';
  action.__validators = validators;
  action.__qrl = actionQrl;
  action.__id = id;
  action.__invalidate = invalidate;
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
      buffer += decoder.decode(result.value, {
        stream: true,
      });
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
  return /* @__PURE__ */ inlinedQrl(
    async function (...args) {
      const fetchOptions2 = _captures[0],
        headers2 = _captures[1],
        method2 = _captures[2],
        origin2 = _captures[3],
        qrl2 = _captures[4];
      const abortSignal = args.length > 0 && args[0] instanceof AbortSignal ? args.shift() : void 0;
      if (isServer) {
        return qrl2.apply(getRequestEvent(this), args);
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
        const qrlHash = qrl2.getHash();
        let query = '';
        const config = {
          ...fetchOptions2,
          method: method2,
          headers: {
            ...headers2,
            'Content-Type': 'application/qwik-json',
            Accept: 'application/json, application/qwik-json, text/qwik-json-stream, text/plain',
            // Required so we don't call accidentally
            'X-QRL': qrlHash,
          },
          signal: abortSignal,
        };
        const captured = qrl2.getCaptured();
        let toSend = [filteredArgs];
        if (captured?.length) {
          toSend = [filteredArgs, ...captured];
        } else {
          toSend = filteredArgs ? [filteredArgs] : [];
        }
        const body = await _serialize(toSend);
        if (method2 === 'GET') {
          query += `&${QDATA_KEY}=${encodeURIComponent(body)}`;
        } else {
          config.body = body;
        }
        const res = await fetch(`${origin2}?${QFN_KEY}=${qrlHash}${query}`, config);
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
    },
    'serverQrl_w03grD0Ag68',
    [fetchOptions, headers, method, origin, qrl]
  );
};
const server$ = /* @__PURE__ */ implicit$FirstArg(serverQrl);

const ServiceWorkerRegister = (props) =>
  /* @__PURE__ */ _jsxSorted(
    'script',
    {
      nonce: _wrapProp(props, 'nonce'),
    },
    {
      type: 'module',
      dangerouslySetInnerHTML: swRegister,
    },
    null,
    3,
    '1x_0'
  );

const _hf0 = (p0) => !p0.reloadDocument;
const _hf0_str = '!p0.reloadDocument';
const _hf1 = (p0) => (p0.spaReset ? 'true' : void 0);
const _hf1_str = 'p0.spaReset?"true":undefined';
const GetForm = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((_rawProps) => {
    const rest = _restProps(_rawProps, ['action', 'spaReset', 'reloadDocument', 'onSubmit$']);
    const nav = useNavigate();
    return /* @__PURE__ */ _jsxSplit(
      'form',
      {
        action: 'get',
        'preventdefault:submit': _fnSignal(_hf0, [_rawProps], _hf0_str),
        'data-spa-reset': _fnSignal(_hf1, [_rawProps], _hf1_str),
        ..._getVarProps(rest),
        ..._getConstProps(rest),
        'q-e:submit': [
          ...(Array.isArray(_rawProps.onSubmit$) ? _rawProps.onSubmit$ : [_rawProps.onSubmit$]),
          /* @__PURE__ */ inlinedQrl(
            async (_evt, form) => {
              const nav2 = _captures[0];
              const formData = new FormData(form);
              const params = new URLSearchParams();
              formData.forEach((value, key) => {
                if (typeof value === 'string') {
                  params.append(key, value);
                }
              });
              await nav2('?' + params.toString(), {
                type: 'form',
                forceReload: true,
              });
            },
            'GetForm_component_form_q_e_submit_r3dkP9d2cF8',
            [nav]
          ),
          /* @__PURE__ */ inlinedQrl((_evt, form) => {
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
          }, 'GetForm_component_form_q_e_submit_1_cuYklZAOHrA'),
        ],
      },
      null,
      /* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, 'Q4_0'),
      0,
      'Q4_1'
    );
  }, 'GetForm_component_2U5Z2Z8ryc0')
);
const Form = ({ action, spaReset, reloadDocument, onSubmit$, ...rest }, key) => {
  if (action) {
    const isArrayApi = Array.isArray(onSubmit$);
    if (isArrayApi) {
      return _jsxSplit(
        'form',
        {
          ..._getVarProps(rest),
          ..._getConstProps(rest),
          action: _wrapProp(action, 'actionPath'),
          'preventdefault:submit': !reloadDocument,
          'q-e:submit': [
            ...onSubmit$,
            // action.submit "submitcompleted" event for onSubmitCompleted$ events
            !reloadDocument
              ? /* @__PURE__ */ inlinedQrl(
                  (evt) => {
                    const action2 = _captures[0];
                    if (!action2.submitted) {
                      return action2.submit(evt);
                    }
                  },
                  'Form_form_q_e_submit_6i0Jq5q8JFg',
                  [action]
                )
              : void 0,
          ],
          ['data-spa-reset']: spaReset ? 'true' : void 0,
        },
        {
          method: 'post',
        },
        null,
        0,
        key
      );
    }
    return _jsxSplit(
      'form',
      {
        ..._getVarProps(rest),
        ..._getConstProps(rest),
        action: _wrapProp(action, 'actionPath'),
        'preventdefault:submit': !reloadDocument,
        'q-e:submit': [
          // Since v2, this fires before the action is executed so it can be prevented
          onSubmit$,
          // action.submit "submitcompleted" event for onSubmitCompleted$ events
          !reloadDocument ? action.submit : void 0,
        ],
        ['data-spa-reset']: spaReset ? 'true' : void 0,
      },
      {
        method: 'post',
      },
      null,
      0,
      key
    );
  } else {
    return /* @__PURE__ */ _jsxSplit(
      GetForm,
      {
        spaReset,
        reloadDocument,
        onSubmit$,
        ...rest,
      },
      null,
      null,
      0,
      key
    );
  }
};

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

const DocumentHeadTags = /* @__PURE__ */ componentQrl(
  /* @__PURE__ */ inlinedQrl((props) => {
    let head = useDocumentHead();
    if (props) {
      head = {
        ...head,
        ...props,
      };
    }
    return /* @__PURE__ */ _jsxSorted(
      Fragment,
      null,
      null,
      [
        head.title && /* @__PURE__ */ _jsxSorted('title', null, null, head.title, 1, 'r5_0'),
        head.meta.map((m) =>
          /* @__PURE__ */ _jsxSplit(
            'meta',
            {
              ..._getVarProps(m),
            },
            _getConstProps(m),
            null,
            0,
            'r5_1'
          )
        ),
        head.links.map((l) =>
          /* @__PURE__ */ _jsxSplit(
            'link',
            {
              ..._getVarProps(l),
            },
            _getConstProps(l),
            null,
            0,
            'r5_2'
          )
        ),
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
      1,
      'r5_3'
    );
  }, 'DocumentHeadTags_component_9CrWYOoCpgY')
);

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
  server$,
  serverQrl,
  untypedAppUrl,
  useDocumentHead,
  useLocation,
  useNavigate,
  useQwikRouter,
  valibot$,
  valibotQrl,
  validator$,
  validatorQrl,
  zod$,
  zodQrl,
};
