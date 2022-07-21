import {
  component$,
  jsx,
  noSerialize,
  SkipRerender,
  useContextProvider,
  useDocument,
  useStore,
  useWatch$,
} from '@builder.io/qwik';
import type { HTMLAttributes } from '@builder.io/qwik';
import { loadRoute } from './routing';
import type {
  ContentState,
  ContentStateInternal,
  MutableRouteLocation,
  PageModule,
  QwikCityRenderDocument,
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
import { getSsrEndpointResponse } from './use-endpoint';
import { isBrowser } from '@builder.io/qwik/build';

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  () => {
    const doc = useDocument() as QwikCityRenderDocument;

    const routeLocation = useStore<MutableRouteLocation>(() => {
      const initRouteLocation = doc?._qwikUserCtx?.qcRoute;
      if (!initRouteLocation) {
        throw new Error(`Missing Qwik City User Context`);
      }
      return initRouteLocation;
    });

    const routeNavigate = useStore<RouteNavigate>(() => {
      const initRouteLocation = doc?._qwikUserCtx?.qcRoute;
      if (!initRouteLocation) {
        throw new Error(`Missing Qwik City User Context`);
      }
      return {
        pathname: initRouteLocation.pathname,
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
      const pathname = track(routeNavigate, 'pathname');
      const loadedRoute = await loadRoute(
        cityPlan.routes,
        cityPlan.menus,
        cityPlan.cacheModules,
        pathname
      );
      if (loadedRoute) {
        const contentModules = loadedRoute.contents;
        const pageModule = contentModules[contentModules.length - 1] as PageModule;
        const endpointResponse = getSsrEndpointResponse(doc);
        const resolvedHead = resolveHead(endpointResponse, routeLocation, contentModules);

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
        routeLocation.href = new URL(pathname, routeLocation.href).href;
        routeLocation.pathname = pathname;
        routeLocation.params = { ...loadedRoute.params };

        if (isBrowser) {
          const pop = (window as any)._qwikcity_pop;
          if (pop !== 2) {
            window.history.pushState(null, '', pathname);
          }
          if (!pop) {
            window.addEventListener('popstate', () => {
              routeNavigate.pathname = window.location.pathname;
              (window as any)._qwikcity_pop = 2;
            });
          }
          (window as any)._qwikcity_pop = 1;
        }
      }
    });

    return () => jsx(SkipRerender, {});
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {}
