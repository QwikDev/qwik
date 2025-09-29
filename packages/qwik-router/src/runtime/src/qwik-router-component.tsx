import * as qwikRouterConfig from '@qwik-router-config';
import {
  $,
  component$,
  getLocale,
  isBrowser,
  isDev,
  isServer,
  noSerialize,
  Slot,
  useContextProvider,
  useServerData,
  useSignal,
  useStore,
  useStyles$,
  useTask$,
  type QRL,
} from '@qwik.dev/core';
import {
  _getContextContainer,
  _getContextElement,
  _getQContainerElement,
  _waitUntilRendered,
  _UNINITIALIZED,
  SerializerSymbol,
  type _ElementVNode,
  type AsyncComputedReadonlySignal,
  type SerializationStrategy,
  forceStoreEffects,
  _hasStoreEffects,
} from '@qwik.dev/core/internal';
import { clientNavigate } from './client-navigate';
import { CLIENT_DATA_CACHE, DEFAULT_LOADERS_SERIALIZATION_STRATEGY, Q_ROUTE } from './constants';
import {
  ContentContext,
  ContentInternalContext,
  DocumentHeadContext,
  RouteActionContext,
  RouteInternalContext,
  RouteLocationContext,
  RouteNavigateContext,
  RoutePreventNavigateContext,
  RouteStateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { loadRoute } from './routing';
import {
  callRestoreScrollOnDocument,
  currentScrollState,
  getScrollHistory,
  restoreScroll,
  saveScrollHistory,
} from './scroll-restoration';
import spaInit from './spa-init';
import type {
  ClientPageData,
  ContentModule,
  ContentState,
  ContentStateInternal,
  DocumentHeadValue,
  Editable,
  EndpointResponse,
  LoadedRoute,
  MutableRouteLocation,
  PageModule,
  PreventNavigateCallback,
  ResolvedDocumentHead,
  RouteActionValue,
  RouteNavigate,
  RouteStateInternal,
  ScrollState,
} from './types';
import { loadClientData } from './use-endpoint';
import { useQwikRouterEnv } from './use-functions';
import { createLoaderSignal, isSameOrigin, isSamePath, toUrl } from './utils';
import { startViewTransition } from './view-transition';
import transitionCss from './qwik-view-transition.css?inline';

/**
 * @deprecated Use `QWIK_ROUTER_SCROLLER` instead (will be removed in V3)
 * @public
 */
export const QWIK_CITY_SCROLLER = '_qCityScroller';

/** @public */
export const QWIK_ROUTER_SCROLLER = '_qRouterScroller';

/** @public */
export interface QwikRouterProps {
  /**
   * Enable the ViewTransition API
   *
   * Default: `true`
   *
   * @see https://github.com/WICG/view-transitions/blob/main/explainer.md
   * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
   * @see https://caniuse.com/mdn_api_viewtransition
   */
  viewTransition?: boolean;
}

/**
 * @deprecated Use `QwikRouterProps` instead. Will be removed in v3.
 * @public
 */
export type QwikCityProps = QwikRouterProps;

// Gets populated by registerPreventNav on the client
const preventNav: {
  $cbs$?: Set<QRL<PreventNavigateCallback>> | undefined;
  $handler$?: (event: BeforeUnloadEvent) => void;
} = {};

// Track navigations during prevent so we don't overwrite
// We need to use an object so we can write into it from qrls
const internalState = { navCount: 0 };

/**
 * @public
 * This hook initializes Qwik Router, providing the necessary context for it to work.
 *
 * This hook should be used once, at the root of your application.
 */
export const useQwikRouter = (props?: QwikRouterProps) => {
  useStyles$(transitionCss);
  const env = useQwikRouterEnv();
  if (!env?.params) {
    throw new Error(
      `Missing Qwik Router Env Data for help visit https://github.com/QwikDev/qwik/issues/6237`
    );
  }

  const urlEnv = useServerData<string>('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }
  const serverHead = useServerData<DocumentHeadValue>('documentHead');

  if (isServer) {
    if (
      env!.ev.originalUrl.pathname !== env!.ev.url.pathname &&
      !__EXPERIMENTAL__.enableRequestRewrite
    ) {
      throw new Error(
        `enableRequestRewrite is an experimental feature and is not enabled. Please enable the feature flag by adding \`experimental: ["enableRequestRewrite"]\` to your qwikVite plugin options.`
      );
    }
  }

  const url = new URL(urlEnv);
  const routeLocationTarget: MutableRouteLocation = {
    url,
    params: env.params,
    isNavigating: false,
    prevUrl: undefined,
  };
  const routeLocation = useStore<MutableRouteLocation>(routeLocationTarget, { deep: false });
  const navResolver: { r?: () => void } = {};
  const container = _getContextContainer();
  const getSerializationStrategy = (loaderId: string): SerializationStrategy => {
    return (
      env.response.loadersSerializationStrategy.get(loaderId) ||
      DEFAULT_LOADERS_SERIALIZATION_STRATEGY
    );
  };

  // On server this object contains the all the loaders data
  // On client after resuming this object contains only keys and _UNINITIALIZED as values
  // Thanks to this we can use this object as a capture ref and not to serialize unneeded data
  // While resolving the loaders we will override the _UNINITIALIZED with the actual data
  const loadersObject: Record<string, unknown> = {};

  // This object contains the signals for the loaders
  // It is used for the loaders context RouteStateContext
  const loaderState: Record<string, AsyncComputedReadonlySignal<unknown>> = {};

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
  // Serialize it as keys and _UNINITIALIZED as values
  (loadersObject as any)[SerializerSymbol] = (obj: Record<string, unknown>) => {
    const loadersSerializationObject: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      loadersSerializationObject[k] = getSerializationStrategy(k) === 'always' ? v : _UNINITIALIZED;
    }
    return loadersSerializationObject;
  };

  const routeInternal = useSignal<RouteStateInternal>({
    type: 'initial',
    dest: url,
    forceReload: false,
    replaceState: false,
    scroll: true,
  });
  const documentHead = useStore<Editable<ResolvedDocumentHead>>(() =>
    createDocumentHead(serverHead)
  );
  const content = useStore<Editable<ContentState>>({
    headings: undefined,
    menu: undefined,
  });

  const contentInternal = useSignal<ContentStateInternal>();

  const currentActionId = env.response.action;
  const currentAction = currentActionId ? env.response.loaders[currentActionId] : undefined;
  const actionState = useSignal<RouteActionValue>(
    currentAction
      ? {
          id: currentActionId!,
          data: env.response.formData,
          output: {
            result: currentAction,
            status: env.response.status,
          },
        }
      : undefined
  );

  const registerPreventNav = $((fn$: QRL<PreventNavigateCallback>) => {
    if (!isBrowser) {
      return;
    }
    preventNav.$handler$ ||= (event: BeforeUnloadEvent) => {
      // track navigations during prevent so we don't overwrite
      internalState.navCount++;
      if (!preventNav.$cbs$) {
        return;
      }
      const prevents = [...preventNav.$cbs$.values()].map((cb) =>
        cb.resolved ? cb.resolved() : cb()
      );
      // this catches both true and Promise<any>
      // we assume a Promise means to prevent the navigation
      if (prevents.some(Boolean)) {
        event.preventDefault();
        // legacy support
        event.returnValue = true;
      }
    };

    (preventNav.$cbs$ ||= new Set()).add(fn$);
    // we need the QRLs to be synchronous if possible, for the beforeunload event
    fn$.resolve();
    // TS thinks we're a webworker and doesn't know about beforeunload
    (window as any).addEventListener('beforeunload', preventNav.$handler$);

    return () => {
      if (preventNav.$cbs$) {
        preventNav.$cbs$.delete(fn$);
        if (!preventNav.$cbs$.size) {
          preventNav.$cbs$ = undefined;
          // unregister the event listener if no more callbacks, to make older Firefox happy
          (window as any).removeEventListener('beforeunload', preventNav.$handler$);
        }
      }
    };
  });

  const goto: RouteNavigate = $(async (path, opt) => {
    const {
      type = 'link',
      forceReload = path === undefined, // Hack for nav() because this API is already set.
      replaceState = false,
      scroll = true,
    } = typeof opt === 'object' ? opt : { forceReload: opt };
    internalState.navCount++;

    const lastDest = routeInternal.value.dest;
    const dest =
      path === undefined
        ? lastDest
        : typeof path === 'number'
          ? path
          : toUrl(path, routeLocation.url);

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
          // Popstate events are not cancellable, so we push to undo
          // TODO keep state?
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
      // Cross-origin nav() should always abort early.
      if (isBrowser) {
        location.href = dest.href;
      }
      return;
    }

    if (!forceReload && isSamePath(dest, lastDest)) {
      if (isBrowser) {
        // Use `location.href` because the lastDest signal is only updated on page navigates.
        if (type === 'link' && dest.href !== location.href) {
          history.pushState(null, '', dest);
        }

        // Always scroll on same-page popstates, #hash clicks, or links.
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
          (window as ClientSPAWindow)._qRouterScrollEnabled = true;
        }
      }

      // TODO Future feature?: update routeLocation.url signal on hash changes for `<Link>` & `<a>` during SPA?
      // - Hashes in Link are already broken in Qwik (<=v1.1.5), and <a> tags are untracked. (not a new bug)
      // - Would need an early pop handler pushed on first # w/o full Nav SPA bootup. (post-SPA refactor)

      return;
    }

    routeInternal.value = { type, dest, forceReload, replaceState, scroll };

    if (isBrowser) {
      loadClientData(dest, _getContextElement());
      loadRoute(
        qwikRouterConfig.routes,
        qwikRouterConfig.menus,
        qwikRouterConfig.cacheModules,
        dest.pathname
      );
    }

    actionState.value = undefined;
    routeLocation.isNavigating = true;

    return new Promise<void>((resolve) => {
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
  useContextProvider(RouteInternalContext, routeInternal);
  useContextProvider<any>(RoutePreventNavigateContext, registerPreventNav);

  useTask$(({ track }) => {
    async function run() {
      const [navigation, action] = track(() => [routeInternal.value, actionState.value]);

      const locale = getLocale('');
      const prevUrl = routeLocation.url;
      const navType = action ? 'form' : navigation.type;
      const replaceState = navigation.replaceState;
      let trackUrl: URL;
      let clientPageData: EndpointResponse | ClientPageData | undefined;
      let loadedRoute: LoadedRoute | null = null;
      let elm: unknown;
      if (isServer) {
        // server
        trackUrl = new URL(navigation.dest, routeLocation.url);
        loadedRoute = env!.loadedRoute;
        clientPageData = env!.response;
      } else {
        // client
        trackUrl = new URL(navigation.dest, location as any as URL);

        // ensure correct trailing slash
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
        elm = _getContextElement();
        const pageData = (clientPageData = await loadClientData(trackUrl, elm, {
          action,
          clearCache: true,
        }));
        if (!pageData) {
          // Reset the path to the current path
          (routeInternal as any).untrackedValue = { type: navType, dest: trackUrl };
          return;
        }
        const newHref = pageData.href;
        const newURL = new URL(newHref, trackUrl);
        if (!isSamePath(newURL, trackUrl)) {
          // Change our path to the canonical path in the response unless rewrite.
          if (!pageData.isRewrite) {
            trackUrl = newURL;
          }

          loadRoutePromise = loadRoute(
            qwikRouterConfig.routes,
            qwikRouterConfig.menus,
            qwikRouterConfig.cacheModules,
            newURL.pathname // Load the actual required path.
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
        const contentModules = mods as ContentModule[];
        const pageModule = contentModules[contentModules.length - 1] as PageModule;

        // Restore search params unless it's a redirect
        if (navigation.dest.search && !!isSamePath(trackUrl, prevUrl)) {
          trackUrl.search = navigation.dest.search;
        }
        let shouldForcePrevUrl = false;
        let shouldForceUrl = false;
        let shouldForceParams = false;
        // Update route location
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

        (routeInternal as any).untrackedValue = { type: navType, dest: trackUrl };

        // Needs to be done after routeLocation is updated
        const resolvedHead = resolveHead(
          clientPageData!,
          routeLocation,
          contentModules,
          locale,
          serverHead
        );

        // Update content
        content.headings = pageModule.headings;
        content.menu = menu;
        (contentInternal as any).untrackedValue = noSerialize(contentModules);

        // Update document head
        documentHead.links = resolvedHead.links;
        documentHead.meta = resolvedHead.meta;
        documentHead.styles = resolvedHead.styles;
        documentHead.scripts = resolvedHead.scripts;
        documentHead.title = resolvedHead.title;
        documentHead.frontmatter = resolvedHead.frontmatter;

        if (isBrowser) {
          let scrollState: ScrollState | undefined;
          if (navType === 'popstate') {
            scrollState = getScrollHistory();
          }
          const scroller =
            document.getElementById(QWIK_ROUTER_SCROLLER) ?? document.documentElement;

          if (
            (navigation.scroll &&
              (!navigation.forceReload || !isSamePath(trackUrl, prevUrl)) &&
              (navType === 'link' || navType === 'popstate')) ||
            // Action might have responded with a redirect.
            (navType === 'form' && !isSamePath(trackUrl, prevUrl))
          ) {
            // Mark next DOM render to scroll.
            (document as any).__q_scroll_restore__ = () =>
              restoreScroll(navType, trackUrl, prevUrl, scroller, scrollState);
          }

          const loaders = clientPageData?.loaders;
          if (loaders) {
            const container = _getContextContainer();
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
                  container
                );
              } else {
                signal.invalidate();
              }
            }
          }
          CLIENT_DATA_CACHE.clear();

          const win = window as ClientSPAWindow;
          if (!win._qRouterSPA) {
            // only add event listener once
            win._qRouterSPA = true;
            history.scrollRestoration = 'manual';

            win.addEventListener('popstate', () => {
              // Disable scroll handler eagerly to prevent overwriting history.state.
              win._qRouterScrollEnabled = false;
              clearTimeout(win._qRouterScrollDebounce);

              goto(location.href, {
                type: 'popstate',
              });
            });

            win.removeEventListener('popstate', win._qRouterInitPopstate!);
            win._qRouterInitPopstate = undefined;

            // Browsers natively will remember scroll on ALL history entries, incl. custom pushState.
            // Devs could push their own states that we can't control.
            // If a user doesn't initiate scroll after, it will not have any scrollState.
            // We patch these to always include scrollState.
            // TODO Block this after Navigation API PR, browsers that support it have a Navigation API solution.
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

                state._qRouterScroll = state._qRouterScroll || currentScrollState(scroller);
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

            // Chromium and WebKit fire popstate+hashchange for all #anchor clicks,
            // ... even if the URL is already on the #hash.
            // Firefox only does it once and no more, but will still scroll. It also sets state to null.
            // Any <a> tags w/ #hash href will break SPA state in Firefox.
            // We patch these events and direct them to Link pipeline during SPA.
            document.body.addEventListener('click', (event) => {
              if (event.defaultPrevented) {
                return;
              }

              const target = (event.target as HTMLElement).closest('a[href]');

              if (target && !target.hasAttribute('preventdefault:click')) {
                const href = target.getAttribute('href')!;
                const prev = new URL(location.href);
                const dest = new URL(href, prev);
                // Patch only same-page anchors.
                if (isSameOrigin(dest, prev) && isSamePath(dest, prev)) {
                  event.preventDefault();

                  // Simulate same-page (no hash) anchor reload.
                  // history.scrollRestoration = 'manual' makes these not scroll.
                  if (!dest.hash && !dest.href.endsWith('#')) {
                    if (dest.href !== prev.href) {
                      history.pushState(null, '', dest);
                    }

                    win._qRouterScrollEnabled = false;
                    clearTimeout(win._qRouterScrollDebounce);
                    saveScrollHistory({
                      ...currentScrollState(scroller),
                      x: 0,
                      y: 0,
                    });
                    location.reload();
                    return;
                  }

                  goto(target.getAttribute('href')!);
                }
              }
            });

            document.body.removeEventListener('click', win._qRouterInitAnchors!);
            win._qRouterInitAnchors = undefined;

            // TODO Remove block after Navigation API PR.
            // Calling `history.replaceState` during `visibilitychange` in Chromium will nuke BFCache.
            // Only Chromium 96 - 101 have BFCache without Navigation API. (<1% of users)
            if (!(window as any).navigation) {
              // Commit scrollState on refresh, cross-origin navigation, mobile view changes, etc.
              document.addEventListener(
                'visibilitychange',
                () => {
                  if (
                    (win._qRouterScrollEnabled || win._qCityScrollEnabled) &&
                    document.visibilityState === 'hidden'
                  ) {
                    if (win._qCityScrollEnabled) {
                      console.warn(
                        '"_qCityScrollEnabled" is deprecated. Use "_qRouterScrollEnabled" instead.'
                      );
                    }
                    // Last & most reliable point to commit state.
                    // Do not clear timeout here in case debounce gets to run later.
                    const scrollState = currentScrollState(scroller);
                    saveScrollHistory(scrollState);
                  }
                },
                { passive: true }
              );

              document.removeEventListener('visibilitychange', win._qRouterInitVisibility!);
              win._qRouterInitVisibility = undefined;
            }

            win.addEventListener(
              'scroll',
              () => {
                // TODO: remove "_qCityScrollEnabled" condition in v3
                if (!win._qRouterScrollEnabled && !win._qCityScrollEnabled) {
                  return;
                }

                clearTimeout(win._qRouterScrollDebounce);
                win._qRouterScrollDebounce = setTimeout(() => {
                  const scrollState = currentScrollState(scroller);
                  saveScrollHistory(scrollState);
                  // Needed for e2e debounceDetector.
                  win._qRouterScrollDebounce = undefined;
                }, 200);
              },
              { passive: true }
            );

            removeEventListener('scroll', win._qRouterInitScroll!);
            win._qRouterInitScroll = undefined;

            // Cache SPA recovery script.
            spaInit.resolve();
          }

          if (navType !== 'popstate') {
            win._qRouterScrollEnabled = false;
            clearTimeout(win._qRouterScrollDebounce);

            // Save the final scroll state before pushing new state.
            // Upgrades/replaces state with scroll pos on nav as needed.
            const scrollState = currentScrollState(scroller);
            saveScrollHistory(scrollState);
          }

          const navigate = () => {
            clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
            (contentInternal as any).force();
            return _waitUntilRendered(elm as Element);
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
          _waitNextPage().then(() => {
            const container = _getQContainerElement(elm as _ElementVNode)!;
            container.setAttribute(Q_ROUTE, routeName);
            const scrollState = currentScrollState(scroller);
            saveScrollHistory(scrollState);
            win._qRouterScrollEnabled = true;
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

/** @public This is a wrapper around the `useQwikRouter()` hook. We recommend using the hook instead of this component. */
export const QwikRouterProvider = component$<QwikRouterProps>((props) => {
  useQwikRouter(props);
  return <Slot />;
});

/**
 * @deprecated Use `useQwikRouter()` instead. Will be removed in v3.
 * @public
 */
export const QwikCityProvider = QwikRouterProvider;

/** @public */
export interface QwikRouterMockProps {
  url?: string;
  params?: Record<string, string>;
  goto?: RouteNavigate;
}

/**
 * @deprecated Use `QwikRouterMockProps` instead. will be removed in V3
 * @public
 */
export type QwikCityMockProps = QwikRouterMockProps;

/** @public */
const useQwikMockRouter = (props: QwikRouterMockProps) => {
  const urlEnv = props.url ?? 'http://localhost/';
  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>(
    {
      url,
      params: props.params ?? {},
      isNavigating: false,
      prevUrl: undefined,
    },
    { deep: false }
  );

  const loaderState = {};
  const routeInternal = useSignal<RouteStateInternal>({ type: 'initial', dest: url });

  const goto: RouteNavigate =
    props.goto ??
    $(async () => {
      console.warn('QwikRouterMockProvider: goto not provided');
    });

  const documentHead = useStore(createDocumentHead, { deep: false });

  const content = useStore<ContentState>(
    {
      headings: undefined,
      menu: undefined,
    },
    { deep: false }
  );

  const contentInternal = useSignal<ContentStateInternal>();

  const actionState = useSignal<RouteActionValue>();

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteActionContext, actionState);
  useContextProvider(RouteInternalContext, routeInternal);
};

/** @public */
export const QwikRouterMockProvider = component$<QwikRouterMockProps>((props) => {
  useQwikMockRouter(props);
  return <Slot />;
});

/**
 * @deprecated Use `useQwikMockRouter()` instead. Will be removed in V3
 * @public
 */
export const QwikCityMockProvider = QwikRouterMockProvider;

export interface ClientSPAWindow extends Window {
  /** @deprecated Use "_qRouterHistoryPatch" instead. Will be removed in V3 */
  _qCityHistoryPatch?: boolean;
  /** @deprecated Use "_qRouterSPA" instead. Will be removed in V3 */
  _qCitySPA?: boolean;
  /** @deprecated Use "_qRouterScrollEnabled" instead. Will be removed in V3 */
  _qCityScrollEnabled?: boolean;
  /** @deprecated Use "_qRouterScrollDebounce" instead. Will be removed in V3 */
  _qCityScrollDebounce?: ReturnType<typeof setTimeout>;
  /** @deprecated Use "_qRouterInitPopstate" instead. Will be removed in V3 */
  _qCityInitPopstate?: () => void;
  /** @deprecated Use "_qRouterInitAnchors" instead. Will be removed in V3 */
  _qCityInitAnchors?: (event: MouseEvent) => void;
  /** @deprecated Use "_qRouterInitVisibility" instead. Will be removed in V3 */
  _qCityInitVisibility?: () => void;
  /** @deprecated Use "_qRouterInitScroll" instead. Will be removed in V3 */
  _qCityInitScroll?: () => void;
  _qRouterHistoryPatch?: boolean;
  _qRouterSPA?: boolean;
  _qRouterScrollEnabled?: boolean;
  _qRouterScrollDebounce?: ReturnType<typeof setTimeout>;
  _qRouterInitPopstate?: () => void;
  _qRouterInitAnchors?: (event: MouseEvent) => void;
  _qRouterInitVisibility?: () => void;
  _qRouterInitScroll?: () => void;
  _qcs?: boolean;
}
