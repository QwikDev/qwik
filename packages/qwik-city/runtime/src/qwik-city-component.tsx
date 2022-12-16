import {
  component$,
  JSXNode,
  noSerialize,
  Slot,
  useContextProvider,
  useEnvData,
  getLocale,
  useStore,
  useWatch$,
  useSignal,
  $,
} from '@builder.io/qwik';
import { loadRoute } from './routing';
import type {
  ClientPageData,
  ContentModule,
  ContentState,
  ContentStateInternal,
  EndpointResponse,
  MutableRouteLocation,
  PageModule,
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

  const urlEnv = useEnvData<string>('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }

  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>({
    href: url.href,
    pathname: url.pathname,
    query: url.searchParams,
    params: env.params,
    isPending: false,
  });

  const loaderState = useStore(env.response.loaders);
  const navPath = useSignal(toPath(url));

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
    routeLocation.isPending = true;
  });

  const documentHead = useStore(createDocumentHead);
  const content = useStore<ContentState>({
    headings: undefined,
    menu: undefined,
  });

  const contentInternal = useStore<ContentStateInternal>({
    contents: undefined,
  });

  const currentActionId = env.response.action;
  const currentAction = currentActionId ? env.response.loaders[currentActionId] : undefined;
  const actionState = useSignal<RouteActionValue>(
    currentAction
      ? {
          id: currentActionId!,
          data: undefined,
          output: {
            result: currentAction,
            status: env.response.status,
          },
        }
      : undefined
  );

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteActionContext, actionState);

  useWatch$(async ({ track }) => {
    const path = track(() => navPath.value);
    const action = track(() => actionState.value);
    const locale = getLocale('');
    const { routes, menus, cacheModules, trailingSlash } = await import('@qwik-city-plan');
    let url = new URL(path, routeLocation.href);
    let loadRoutePromise = loadRoute(routes, menus, cacheModules, url.pathname);
    let clientPageData: EndpointResponse | ClientPageData | undefined;
    if (isServer) {
      clientPageData = env.response;
    } else {
      const pageData = (clientPageData = await loadClientData(url.href, true, action));
      const newHref = pageData?.href;
      if (newHref) {
        const newURL = new URL(newHref, url.href);
        if (newURL.pathname !== url.pathname) {
          url = newURL;
          loadRoutePromise = loadRoute(routes, menus, cacheModules, url.pathname);
        }
      }
    }
    // ensure correct trailing slash
    if (url.pathname.endsWith('/')) {
      if (!trailingSlash) {
        url.pathname = url.pathname.slice(0, -1);
      }
    } else if (trailingSlash) {
      url.pathname += '/';
    }
    const pathname = url.pathname;
    const loadedRoute = await loadRoutePromise;
    if (loadedRoute) {
      const [params, mods, menu] = loadedRoute;
      const contentModules = mods as ContentModule[];
      const pageModule = contentModules[contentModules.length - 1] as PageModule;
      const resolvedHead = await resolveHead(clientPageData, routeLocation, contentModules, locale);

      // Update route location
      routeLocation.href = url.href;
      routeLocation.pathname = pathname;
      routeLocation.params = { ...params };
      routeLocation.query = url.searchParams;

      // Update content
      content.headings = pageModule.headings;
      content.menu = menu;
      contentInternal.contents = noSerialize(contentModules);

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
        routeLocation.isPending = false;
      }
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
    isPending: false,
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

  const contentInternal = useStore<ContentStateInternal>({
    contents: undefined,
  });

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  return <Slot />;
});
