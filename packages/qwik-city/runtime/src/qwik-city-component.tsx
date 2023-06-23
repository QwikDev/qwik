import {
  $,
  component$,
  getLocale,
  noSerialize,
  Slot,
  useContextProvider,
  useServerData,
  useSignal,
  useStore,
  useTask$,
  _getContextElement,
  _weakSerialize,
  useStyles$,
  _waitUntilRendered,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import * as qwikCity from '@qwik-city-plan';
import { CLIENT_DATA_CACHE } from './constants';
import {
  ContentContext,
  ContentInternalContext,
  DocumentHeadContext,
  RouteActionContext,
  RouteInternalContext,
  RouteLocationContext,
  RouteNavigateContext,
  RouteStateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { loadRoute } from './routing';
import type {
  ClientPageData,
  ContentModule,
  ContentState,
  ContentStateInternal,
  Editable,
  EndpointResponse,
  LoadedRoute,
  MutableRouteLocation,
  PageModule,
  ResolvedDocumentHead,
  RouteActionValue,
  RouteNavigate,
  RouteStateInternal,
  RestoreScroll,
  ScrollState,
} from './types';
import { loadClientData } from './use-endpoint';
import { useQwikCityEnv } from './use-functions';
import { isSameOrigin, isSamePath, isSamePathname, toUrl } from './utils';
import { clientNavigate } from './client-navigate';
import {
  currentScrollState,
  getScrollHistory,
  saveScrollHistory,
  scrollToHashId,
  toLastPositionOnPopState,
} from './scroll-restoration';

/**
 * @public
 */
export interface QwikCityProps {
  // /**
  //  * The QwikCity component must have only two direct children: `<head>` and `<body>`, like the following example:
  //  *
  //  * ```tsx
  //  * <QwikCityProvider>
  //  *   <head>
  //  *     <meta charSet="utf-8" />
  //  *   </head>
  //  *   <body lang="en"></body>
  //  * </QwikCityProvider>
  //  * ```
  //  */
  // children?: [JSXNode, JSXNode];

  /**
   * Enable the ViewTransition API
   *
   * Default: `true`
   *
   * @see https://github.com/WICG/view-transitions/blob/main/explainer.md
   * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
   * @see https://caniuse.com/mdn-api_viewtransition
   */
  viewTransition?: boolean;

  /**
   * @alpha
   * Scroll restoration logic for SPA navigation.
   *
   * Default: `toLastPositionOnPopState`
   */
  restoreScroll$?: RestoreScroll;
}

/**
 * @public
 */
export const QwikCityProvider = component$<QwikCityProps>((props) => {
  useStyles$(`:root{view-transition-name:none}`);
  const env = useQwikCityEnv();
  if (!env?.params) {
    throw new Error(`Missing Qwik City Env Data`);
  }

  const urlEnv = useServerData<string>('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }

  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>(
    {
      url,
      params: env.params,
      isNavigating: false,
      prevUrl: undefined,
    },
    { deep: false }
  );
  const navResolver: { r?: () => void } = {};
  const loaderState = _weakSerialize(useStore(env.response.loaders, { deep: false }));
  const routeInternal = useSignal<RouteStateInternal>({
    type: 'initial',
    dest: url,
    replaceState: false,
  });
  const documentHead = useStore<Editable<ResolvedDocumentHead>>(createDocumentHead);
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

  const goto: RouteNavigate = $(async (path, opt) => {
    const {
      type = 'link',
      forceReload = false,
      replaceState = false,
    } = typeof opt === 'object' ? opt : { forceReload: opt };
    const lastDest = routeInternal.value.dest;
    let dest = path === undefined ? lastDest : toUrl(path, routeLocation.url);

    // Remove empty # before sending them into Navigate, it introduces too many edgecases.
    dest = !dest.hash && dest.href.endsWith('#') ? new URL(dest.href.slice(0, -1)) : dest;

    if (!forceReload && dest.href === lastDest.href) {
      if (isBrowser) {
        if (type === 'link') {
          if (dest.hash) {
            scrollToHashId(dest.hash);
          } else {
            window.scrollTo(0, 0);
          }
        }
      }

      return;
    }
    routeInternal.value = { type, dest, replaceState };

    if (isBrowser) {
      loadClientData(dest, _getContextElement());
      loadRoute(qwikCity.routes, qwikCity.menus, qwikCity.cacheModules, dest.pathname);
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
          if (!qwikCity.trailingSlash) {
            trackUrl.pathname = trackUrl.pathname.slice(0, -1);
          }
        } else if (qwikCity.trailingSlash) {
          trackUrl.pathname += '/';
        }
        let loadRoutePromise = loadRoute(
          qwikCity.routes,
          qwikCity.menus,
          qwikCity.cacheModules,
          trackUrl.pathname
        );
        elm = _getContextElement();
        const pageData = (clientPageData = await loadClientData(trackUrl, elm, true, action));
        if (!pageData) {
          // Reset the path to the current path
          (routeInternal as any).untrackedValue = { type: navType, dest: trackUrl };
          return;
        }
        const newHref = pageData.href;
        const newURL = new URL(newHref, trackUrl);
        if (!isSamePathname(newURL, trackUrl)) {
          trackUrl = newURL;
          loadRoutePromise = loadRoute(
            qwikCity.routes,
            qwikCity.menus,
            qwikCity.cacheModules,
            trackUrl.pathname
          );
        }
        loadedRoute = await loadRoutePromise;
      }

      if (loadedRoute) {
        const [params, mods, menu] = loadedRoute;
        const contentModules = mods as ContentModule[];
        const pageModule = contentModules[contentModules.length - 1] as PageModule;

        if (isBrowser) {
          let scrollState: ScrollState | undefined;
          if (navType === 'popstate') {
            scrollState = getScrollHistory();
          }

          // Awaits a QRL to resolve scroll function, must happen BEFORE setting contentInternal.value below.
          // This is because the actual scroll restore needs to be synchronous with render.
          const scrollRestoreQrl = props.restoreScroll$ ?? toLastPositionOnPopState;
          document.__q_scroll_restore__ = await scrollRestoreQrl(
            navType,
            prevUrl,
            trackUrl,
            scrollState
          );
        }

        // Update route location
        routeLocation.prevUrl = prevUrl;
        routeLocation.url = trackUrl;
        routeLocation.params = { ...params };

        (routeInternal as any).untrackedValue = { type: navType, dest: trackUrl };

        // Needs to be done after routeLocation is updated
        const resolvedHead = resolveHead(clientPageData!, routeLocation, contentModules, locale);

        // Update content
        content.headings = pageModule.headings;
        content.menu = menu;
        contentInternal.value = noSerialize(contentModules);

        // Update document head
        documentHead.links = resolvedHead.links;
        documentHead.meta = resolvedHead.meta;
        documentHead.styles = resolvedHead.styles;
        documentHead.title = resolvedHead.title;
        documentHead.frontmatter = resolvedHead.frontmatter;

        if (isBrowser) {
          if (props.viewTransition !== false) {
            // mark next DOM render to use startViewTransition API
            document.__q_view_transition__ = true;
          }

          const loaders = clientPageData?.loaders;
          const win = window as ClientSPAWindow;
          if (loaders) {
            Object.assign(loaderState, loaders);
          }
          CLIENT_DATA_CACHE.clear();

          if (!win._qCitySPA) {
            // only add event listener once
            win._qCitySPA = true;
            history.scrollRestoration = 'manual';

            win.addEventListener('popstate', () => {
              // Disable scroll handler eagerly to prevent overwriting history.state.
              win._qCityScrollEnabled = false;
              clearTimeout(win._qCityScrollDebounce);
              // TODO This might not get re-enabled if we pop onto the same path? (no re-render)
              // TODO Test by adding a fake pushState and popping.
              // TODO Remove all checks for state, always save scroll.

              goto(location.href, {
                type: 'popstate',
              });
            });

            win.removeEventListener('popstate', win._qCityInitPopstate!);
            win._qCityInitPopstate = undefined;

            // Chromium and WebKit fire popstate+hashchange for all #anchor clicks,
            // ... even if the URL is already on the #hash.
            // Firefox only does it once and no more, but will still scroll. It also sets state to null.
            // Any <a> tags w/ #hash href will break SPA state in Firefox.
            // However, Chromium & WebKit also create too many edgecase problems with <a href="#">.
            // We patch these events and direct them to Link pipeline during SPA.
            document.body.addEventListener('click', (event) => {
              if (event.defaultPrevented) {
                return;
              }

              const target = (event.target as HTMLElement).closest('a[href*="#"]');

              if (target && !target.hasAttribute('preventdefault:click')) {
                const prev = routeLocation.url;
                const dest = toUrl(target.getAttribute('href')!, prev);
                // Patch only same-page hash anchors.
                if (isSameOrigin(dest, prev) && isSamePath(dest, prev)) {
                  event.preventDefault();
                  goto(target.getAttribute('href')!);
                }
              }
            });

            // TODO Remove block after Navigation API PR.
            // Calling `history.replaceState` during `visibilitychange` in Chromium will nuke BFCache.
            // Only Chromium 96 - 101 have BFCache without Navigation API. (<1% of users)
            if (!(window as any).navigation) {
              // Commit scrollState on refresh, cross-origin navigation, mobile view changes, etc.
              document.addEventListener(
                'visibilitychange',
                () => {
                  if (win._qCityScrollEnabled && document.visibilityState === 'hidden') {
                    // Last & most reliable point to commit state.
                    // Do not clear timeout here in case debounce gets to run later.
                    const scrollState = currentScrollState(document.documentElement);
                    saveScrollHistory(scrollState);
                  }
                },
                { passive: true }
              );
            }

            win.addEventListener(
              'scroll',
              () => {
                if (!win._qCityScrollEnabled) {
                  return;
                }

                clearTimeout(win._qCityScrollDebounce);
                win._qCityScrollDebounce = setTimeout(() => {
                  const scrollState = currentScrollState(document.documentElement);
                  saveScrollHistory(scrollState);
                  // Needed for e2e debounceDetector.
                  win._qCityScrollDebounce = undefined;
                }, 200);
              },
              { passive: true }
            );

            removeEventListener('scroll', win._qCityInitScroll!);
            win._qCityInitScroll = undefined;

            win._qCityBootstrap?.remove();
            win._qCityBootstrap = undefined;
          }

          if (navType !== 'popstate') {
            win._qCityScrollEnabled = false;
            clearTimeout(win._qCityScrollDebounce);

            // Save the final scroll state before pushing new state.
            // Upgrades/replaces state with scroll pos on nav as needed.
            const scrollState = currentScrollState(document.documentElement);
            saveScrollHistory(scrollState, true);
          }

          clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
          // TODO Docs says isNavigating should be set AFTER render?
          routeLocation.isNavigating = false;
          _waitUntilRendered(elm as Element).then(() => {
            const scrollState = currentScrollState(document.documentElement);
            saveScrollHistory(scrollState);
            win._qCityScrollEnabled = true;

            navResolver.r?.();
          });
        }
      }
    }
    const promise = run();
    if (isServer) {
      return promise;
    } else {
      return;
    }
  });

  return <Slot />;
});

/**
 * @public
 */
export interface QwikCityMockProps {
  url?: string;
  params?: Record<string, string>;
}

/**
 * @public
 */
export const QwikCityMockProvider = component$<QwikCityMockProps>((props) => {
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

  const loaderState = useSignal({});
  const routeInternal = useSignal<RouteStateInternal>({ type: 'initial', dest: url });

  const goto: RouteNavigate = $(async (path) => {
    throw new Error('Not implemented');
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

  return <Slot />;
});

export interface ClientSPAWindow extends Window {
  _qCitySPA?: boolean;
  _qCityScrollEnabled?: boolean;
  _qCityScrollDebounce?: ReturnType<typeof setTimeout>;
  _qCityInitPopstate?: () => void;
  _qCityInitScroll?: () => void;
  _qCityBootstrap?: HTMLAnchorElement;
}
