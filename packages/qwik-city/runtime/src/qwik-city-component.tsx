import {
  component$,
  getLocale,
  JSXNode,
  noSerialize,
  Slot,
  useContextProvider,
  useServerData,
  useStore,
  useSignal,
  useTask$,
  $,
  _weakSerialize,
} from '@builder.io/qwik';
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
} from './types';
import {
  ContentContext,
  ContentInternalContext,
  DocumentHeadContext,
  RouteActionContext,
  RouteLocationContext,
  RouteNavigateContext,
  RouteStateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { useQwikCityEnv } from './use-functions';
import { clientNavigate } from './client-navigate';
import { loadClientData } from './use-endpoint';
import { toPath } from './utils';
import { CLIENT_DATA_CACHE } from './constants';

/**
 * @alpha
 */
export interface QwikCityProps {
  /**
   * The QwikCity component must have only two direct children: `<head>` and `<body>`, like the following example:
   *
   * ```tsx
   * <QwikCityProvider>
   *   <head>
   *     <meta charSet="utf-8" />
   *   </head>
   *   <body lang="en"></body>
   * </QwikCityProvider>
   * ```
   */
  children?: [JSXNode, JSXNode];
}

/**
 * @alpha
 */
export const QwikCityProvider = component$<QwikCityProps>(() => {
  const env = useQwikCityEnv();
  if (!env?.params) {
    throw new Error(`Missing Qwik City Env Data`);
  }

  const urlEnv = useServerData<string>('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }

  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>({
    href: url.href,
    pathname: url.pathname,
    query: url.searchParams,
    params: env.params,
    isNavigating: false,
  });

  const loaderState = _weakSerialize(useStore(env.response.loaders));
  const navPath = useSignal(toPath(url));
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

  const goto: RouteNavigate = $(async (path) => {
    const value = navPath.value;
    if (path) {
      if (value === path) {
        return;
      }
      navPath.value = path;
    } else {
      // force a change
      navPath.value = '';
      navPath.value = value;
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

  useTask$(({ track }) => {
    async function run() {
      const [path, action] = track(() => [navPath.value, actionState.value]);
      const locale = getLocale('');
      let url = new URL(path, routeLocation.href);
      let clientPageData: EndpointResponse | ClientPageData | undefined;
      let loadedRoute: LoadedRoute | null = null;
      if (isServer) {
        loadedRoute = env!.loadedRoute;
        clientPageData = env!.response;
      } else {
        const { routes, menus, cacheModules, trailingSlash } = await import('@qwik-city-plan');
        let loadRoutePromise = loadRoute(routes, menus, cacheModules, url.pathname);
        const pageData = (clientPageData = await loadClientData(url.href, true, action));
        if (!pageData) {
          // Reset the path to the current path
          (navPath as any).untrackedValue = routeLocation.pathname;
          return;
        }
        const newHref = pageData.href;
        const newURL = new URL(newHref, url.href);
        if (newURL.pathname !== url.pathname) {
          url = newURL;
          loadRoutePromise = loadRoute(routes, menus, cacheModules, url.pathname);
        }

        // ensure correct trailing slash
        if (url.pathname.endsWith('/')) {
          if (!trailingSlash) {
            url.pathname = url.pathname.slice(0, -1);
          }
        } else if (trailingSlash) {
          url.pathname += '/';
        }
        loadedRoute = await loadRoutePromise;
      }

      if (loadedRoute) {
        const [params, mods, menu] = loadedRoute;
        const pathname = url.pathname;
        const contentModules = mods as ContentModule[];
        const pageModule = contentModules[contentModules.length - 1] as PageModule;

        // Update route location
        routeLocation.href = url.href;
        routeLocation.pathname = pathname;
        routeLocation.params = { ...params };
        routeLocation.query = url.searchParams;

        (navPath as any).untrackedValue = pathname;

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
          const loaders = clientPageData?.loaders;
          if (loaders) {
            Object.assign(loaderState, loaders);
          }
          CLIENT_DATA_CACHE.clear();

          clientNavigate(window, pathname, navPath);
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
 * @alpha
 * @deprecated - The "QwikCity" component has been renamed to "QwikCityProvider".
 */
export const QwikCity = QwikCityProvider;

/**
 * @alpha
 * @deprecated - The "Html" component has been renamed to "QwikCity".
 */
export const Html = QwikCity;

/**
 * @alpha
 */
export interface QwikCityMockProps {
  url?: string;
  params?: Record<string, string>;
}

/**
 * @alpha
 */
export const QwikCityMockProvider = component$<QwikCityMockProps>((props) => {
  const urlEnv = props.url ?? 'http://localhost/';
  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>({
    href: url.href,
    pathname: url.pathname,
    query: url.searchParams,
    params: props.params ?? {},
    isNavigating: false,
  });

  const loaderState = useSignal({});

  const goto: RouteNavigate = $(async (path) => {
    throw new Error('Not implemented');
  });

  const documentHead = useStore(createDocumentHead);

  const content = useStore<ContentState>({
    headings: undefined,
    menu: undefined,
  });

  const contentInternal = useSignal<ContentStateInternal>();

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  return <Slot />;
});
