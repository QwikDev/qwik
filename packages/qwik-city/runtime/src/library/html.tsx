import {
  component$,
  jsx,
  noSerialize,
  SkipRerender,
  useContextProvider,
  useDocument,
  useSequentialScope,
  useStore,
  useWaitOn,
} from '@builder.io/qwik';
import type { HTMLAttributes } from '@builder.io/qwik';
import { loadRoute, matchRoute } from './routing';
import type { ContentState, PageModule, QwikCityRenderDocument, RouteLocation } from './types';
import {
  ContentContext,
  ContentMenusContext,
  DocumentHeadContext,
  RouteLocationContext,
} from './constants';
import { createDocumentHead, resolveHead } from './head';
import { loadEndpointResponse } from './use-endpoint';
import cityPlan from '@qwik-city-plan';

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  () => {
    const { get, set } = useSequentialScope();
    if (get) {
      return jsx(SkipRerender, {});
    }
    set(true);

    const content = useStore<ContentState>({
      breadcrumbs: undefined,
      headings: undefined,
      modules: [],
    });

    const doc = useDocument() as QwikCityRenderDocument;
    const documentHead = useStore(() => createDocumentHead());

    const routeLocation = useStore<RouteLocation>(() => {
      const docLocation = new URL(doc.defaultView!.location as any);
      const matchedRoute = matchRoute(cityPlan.routes, docLocation.pathname);
      const loc: RouteLocation = {
        hash: docLocation.hash,
        hostname: docLocation.hostname,
        href: docLocation.href,
        params: { ...matchedRoute?.params },
        pathname: docLocation.pathname,
        query: {},
        search: docLocation.search,
      };
      docLocation.searchParams.forEach((value, key) => (loc.query[key] = value));
      return loc;
    });

    useContextProvider(ContentContext, content);
    useContextProvider(ContentMenusContext, cityPlan.menus || {});
    useContextProvider(DocumentHeadContext, documentHead);
    useContextProvider(RouteLocationContext, routeLocation);

    useWaitOn(
      loadRoute(cityPlan.routes, routeLocation.pathname)
        .then((loadedRoute) => {
          if (loadedRoute) {
            loadEndpointResponse(doc, routeLocation.pathname).then((endpointResponse) => {
              const contentModules = loadedRoute.modules;
              const pageModule = contentModules[contentModules.length - 1] as PageModule;
              const resolvedHead = resolveHead(endpointResponse, routeLocation, contentModules);

              documentHead.links = resolvedHead.links;
              documentHead.meta = resolvedHead.meta;
              documentHead.styles = resolvedHead.styles;
              documentHead.title = resolvedHead.title;

              content.breadcrumbs = pageModule.breadcrumbs;
              content.headings = pageModule.headings;
              content.modules = noSerialize<any>(contentModules);

              routeLocation.params = { ...loadedRoute.params };
            });
          }
        })
        .catch((e) => console.error(e))
    );

    return () => jsx(SkipRerender, {});
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {}
