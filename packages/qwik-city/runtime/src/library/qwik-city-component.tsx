import {
  component$,
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
import { clientNavigate, toPath } from './client-navigation';
import { loadClientData } from './use-endpoint';

/**
 * @alpha
 */
export const QwikCity = component$(() => {
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

    const endpointResponse = isServer
      ? env?.response
      : loadClientData(sessionStorage, url.pathname, url);

    const [loadedRoute, clientPageData] = await Promise.all([
      loadRoute(routes, menus, cacheModules, url.pathname),
      endpointResponse,
    ]);

    if (loadedRoute) {
      // Update route location
      routeLocation.href = url.href;
      routeLocation.pathname = url.pathname;
      routeLocation.params = { ...loadedRoute.params };
      routeLocation.query = Object.fromEntries(url.searchParams.entries());

      const contentModules = loadedRoute.mods as ContentModule[];
      const pageModule = contentModules[contentModules.length - 1] as PageModule;
      const resolvedHead = resolveHead(clientPageData, routeLocation, contentModules);

      // Update document head
      documentHead.links = resolvedHead.links;
      documentHead.meta = resolvedHead.meta;
      documentHead.styles = resolvedHead.styles;
      documentHead.title = resolvedHead.title;

      // Update content
      content.headings = pageModule.headings;
      content.menu = loadedRoute.menu;
      contentInternal.contents = noSerialize(contentModules);

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
