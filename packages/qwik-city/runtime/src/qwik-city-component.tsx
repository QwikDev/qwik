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
} from './types';
import { loadClientData } from './use-endpoint';
import { useQwikCityEnv } from './use-functions';
import { isSamePathname, toUrl } from './utils';
import { clientNavigate, getHistoryId } from './client-navigate';
import {
  currentScrollState,
  getOrInitializeScrollRecord,
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
    const dest = path === undefined ? lastDest : toUrl(path, routeLocation.url);
    if (!forceReload && dest.href === lastDest.href) {
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
          const navId = getHistoryId();
          const scrollRecord = getOrInitializeScrollRecord();
          scrollRecord[navId] = currentScrollState(document.documentElement);

          // Awaits a QRL to resolve scroll function, must happen BEFORE setting contentInternal.value below.
          // This is because the actual scroll restore needs to be synchronous with render.
          const scrollRestoreQrl = props.restoreScroll$ ?? toLastPositionOnPopState;
          document.__q_scroll_restore__ = await scrollRestoreQrl(
            navType,
            prevUrl,
            trackUrl,
            scrollRecord
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
          const win = window as ClientHistoryWindow;
          if (loaders) {
            Object.assign(loaderState, loaders);
          }
          CLIENT_DATA_CACHE.clear();
          if (!win._qCityHistory) {
            // only add event listener once
            win._qCityHistory = 1;

            win.addEventListener('popstate', () => {
              return goto(location.href, {
                type: 'popstate',
              });
            });

            win.removeEventListener('popstate', win._qCityPopstateFallback!);

            if (history.scrollRestoration) {
              history.scrollRestoration = 'manual';
            }
          }
          clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
          routeLocation.isNavigating = false;
          _waitUntilRendered(elm as Element).then(navResolver.r);
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

interface ClientHistoryWindow extends Window {
  _qCityHistory?: 1;
  _qCityPopstateFallback?: () => void;
}
