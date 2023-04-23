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
} from './types';
import { loadClientData } from './use-endpoint';
import { useQwikCityEnv } from './use-functions';
import { isSameOriginDifferentPathname, isSamePathname, toUrl } from './utils';
import { clientNavigate } from './client-navigate';

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
}

/**
 * @public
 */
export const QwikCityProvider = component$<QwikCityProps>((props) => {
  useStyles$(`:root{view-transition-name: none}`);
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
    },
    { deep: false }
  );

  const loaderState = _weakSerialize(useStore(env.response.loaders, { deep: false }));
  const routeInternal = useSignal<RouteStateInternal>({ type: 'initial', dest: url });
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
    const { type = 'link', forceReload = false } =
      typeof opt === 'object' ? opt : { forceReload: opt };
    const lastDest = routeInternal.value.dest;
    const dest = path === undefined ? lastDest : toUrl(path, routeLocation.url);
    if (!forceReload && dest.href === lastDest.href) {
      return;
    }
    routeInternal.value = { type, dest };

    if (isBrowser) {
      loadClientData(dest, _getContextElement());
      loadRoute(qwikCity.routes, qwikCity.menus, qwikCity.cacheModules, dest.pathname);
    }

    actionState.value = undefined;
    routeLocation.isNavigating = true;
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
      let trackUrl: URL;
      let clientPageData: EndpointResponse | ClientPageData | undefined;
      let loadedRoute: LoadedRoute | null = null;

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
        const element = _getContextElement();
        const pageData = (clientPageData = await loadClientData(trackUrl, element, true, action));
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

        // Update route location
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
          if (
            (props.viewTransition ?? true) &&
            isSameOriginDifferentPathname(window.location, url)
          ) {
            // mark next DOM render to use startViewTransition API
            document.__q_view_transition__ = true;
          }

          const loaders = clientPageData?.loaders;
          if (loaders) {
            Object.assign(loaderState, loaders);
          }
          CLIENT_DATA_CACHE.clear();

          clientNavigate(window, navType, prevUrl, trackUrl);
          routeLocation.isNavigating = false;
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
