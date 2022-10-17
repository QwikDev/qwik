import {
  component$,
  JSXNode,
  noSerialize,
  Slot,
  useContextProvider,
  useEnvData,
  useStore,
  useWatch$,
} from '@builder.io/qwik';
import { loadRoute } from './routing';
import type {
  ContentModule,
  ContentState,
  ContentStateInternal,
  MutableRouteLocation,
  PageModule,
  RouteNavigate,
} from './types';
import {
  ContentContext,
  ContentInternalContext,
  DocumentHeadContext,
  RouteLocationContext,
  RouteNavigateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { isBrowser, isServer } from '@builder.io/qwik/build';
import { useQwikCityEnv } from './use-functions';
import { clientNavigate } from './client-navigate';
import { loadClientData } from './use-endpoint';
import { toPath } from './utils';

/**
 * @alpha
 */
export interface QwikCityProps {
  /**
   * The QwikCity component must have only two direct children: `<head>` and `<body>`, like the following example:
   *
   * ```tsx
   * <QwikCity>
   *   <head>
   *     <meta charSet="utf-8" />
   *   </head>
   *   <body lang="en"></body>
   * </QwikCity>
   * ```
   */
  children?: [JSXNode, JSXNode];
}

/**
 * @alpha
 */
export const QwikCity = component$<QwikCityProps>(() => {
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
    query: Object.fromEntries(url.searchParams.entries()),
    params: env.params,
  });

  const routeNavigate = useStore<RouteNavigate>({
    path: toPath(url),
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
  useContextProvider(RouteNavigateContext, routeNavigate);

  useWatch$(async ({ track }) => {
    const { routes, menus, cacheModules } = await import('@qwik-city-plan');
    const path = track(routeNavigate, 'path');
    const url = new URL(path, routeLocation.href);
    const pathname = url.pathname;

    const loadRoutePromise = loadRoute(routes, menus, cacheModules, pathname);

    const endpointResponse = isServer ? env.response : loadClientData(url.href);

    const loadedRoute = await loadRoutePromise;

    if (loadedRoute) {
      const [params, mods, menu] = loadedRoute;
      const contentModules = mods as ContentModule[];
      const pageModule = contentModules[contentModules.length - 1] as PageModule;

      // Update route location
      routeLocation.href = url.href;
      routeLocation.pathname = pathname;
      routeLocation.params = { ...params };
      routeLocation.query = Object.fromEntries(url.searchParams.entries());

      // Update content
      content.headings = pageModule.headings;
      content.menu = menu;
      contentInternal.contents = noSerialize(contentModules);

      const clientPageData = await endpointResponse;
      const resolvedHead = resolveHead(clientPageData, routeLocation, contentModules);

      // Update document head
      documentHead.links = resolvedHead.links;
      documentHead.meta = resolvedHead.meta;
      documentHead.styles = resolvedHead.styles;
      documentHead.title = resolvedHead.title;
      documentHead.frontmatter = resolvedHead.frontmatter;

      if (isBrowser) {
        clientNavigate(window, routeNavigate);
      }
    }
  });

  return <Slot />;
});

/**
 * @alpha
 * @deprecated - The "Html" component has been renamed to "QwikCity".
 */
export const Html = QwikCity;
