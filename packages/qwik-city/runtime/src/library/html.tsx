import {
  component$,
  noSerialize,
  SkipRerender,
  useContextProvider,
  useStore,
  useWatch$,
} from '@builder.io/qwik';
import type { HTMLAttributes } from '@builder.io/qwik';
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
import { isBrowser } from '@builder.io/qwik/build';
import { useQwikCityContext } from './use-functions';

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  () => {
    const ctx = useQwikCityContext();

    const routeLocation = useStore<MutableRouteLocation>(() => {
      const initRouteLocation = ctx?.route;
      if (!initRouteLocation) {
        throw new Error(`Missing Qwik City User Context`);
      }
      return initRouteLocation;
    });

    const routeNavigate = useStore<RouteNavigate>(() => {
      const initRouteLocation = ctx?.route;
      if (!initRouteLocation) {
        throw new Error(`Missing Qwik City User Context`);
      }
      const url = new URL(initRouteLocation.href);

      return {
        path: url.pathname + url.search,
      };
    });

    const documentHead = useStore(createDocumentHead);
    const content = useStore<ContentState>({
      headings: undefined,
      menu: undefined,
    });

    const contentInternal = useStore<ContentStateInternal>({
      contents: [],
    });

    useContextProvider(ContentContext, content);
    useContextProvider(ContentInternalContext, contentInternal);
    useContextProvider(DocumentHeadContext, documentHead);
    useContextProvider(RouteLocationContext, routeLocation);
    useContextProvider(RouteNavigateContext, routeNavigate);

    useWatch$(async (track) => {
      const { default: cityPlan } = await import('@qwik-city-plan');
      const fullPath = track(routeNavigate, 'path');
      const url = new URL(fullPath, routeLocation.href);
      const loadedRoute = await loadRoute(
        cityPlan.routes,
        cityPlan.menus,
        cityPlan.cacheModules,
        url.pathname
      );
      if (loadedRoute) {
        const contentModules = loadedRoute.mods as ContentModule[];
        const pageModule = contentModules[contentModules.length - 1] as PageModule;
        const resolvedHead = resolveHead(ctx?.response, routeLocation, contentModules);

        // Update document head
        documentHead.links = resolvedHead.links;
        documentHead.meta = resolvedHead.meta;
        documentHead.styles = resolvedHead.styles;
        documentHead.title = resolvedHead.title;

        // Update content
        content.headings = pageModule.headings;
        content.menu = loadedRoute.menu;
        contentInternal.contents = noSerialize<any>(contentModules);

        // Update route location
        routeLocation.href = url.href;
        routeLocation.pathname = url.pathname;
        routeLocation.params = { ...loadedRoute.params };
        routeLocation.query = Object.fromEntries(url.searchParams.entries());

        if (isBrowser) {
          const pop = (window as any)._qwikcity_pop;
          if (pop !== 2) {
            window.history.pushState(null, '', fullPath);
          }
          if (!pop) {
            window.addEventListener('popstate', () => {
              routeNavigate.path = window.location.href;
              (window as any)._qwikcity_pop = 2;
            });
          }
          (window as any)._qwikcity_pop = 1;
        }
      }
    });

    return <SkipRerender />;
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {}
