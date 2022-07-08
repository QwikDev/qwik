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
import type {
  ContentResponse,
  ContentState,
  DocumentHead,
  PageModule,
  QwikCityPlan,
  RouteLocation,
} from './types';
import {
  ContentContext,
  ContentMenusContext,
  DocumentHeadContext,
  ResponseContext,
  RouteLocationContext,
  RoutesContext,
} from './constants';
import { createDocumentHead, resolveHead } from './head';

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  ({ cityPlan }) => {
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

    const doc = useDocument();
    const documentHead = useStore<DocumentHead>(() => createDocumentHead());
    const contentResponse = useStore<Required<ContentResponse>>({
      status: null,
      cacheControl: null,
      redirect: null,
    });

    const routeLocation = useStore<RouteLocation>(() => {
      const docLocation = new URL(doc.defaultView!.location as any);
      const matchedRoute = matchRoute(cityPlan.routes, docLocation.pathname);
      const loc: RouteLocation = {
        hash: docLocation.hash,
        host: docLocation.host,
        hostname: docLocation.hostname,
        href: docLocation.href,
        pathname: docLocation.pathname,
        port: docLocation.port,
        params: { ...matchedRoute?.params },
        search: docLocation.search,
        query: {},
      };
      docLocation.searchParams.forEach((value, key) => (loc.query[key] = value));
      return loc;
    });

    useContextProvider(ContentContext, content);
    useContextProvider(ContentMenusContext, cityPlan.menus || {});
    useContextProvider(DocumentHeadContext, documentHead);
    useContextProvider(RouteLocationContext, routeLocation);
    useContextProvider(RoutesContext, noSerialize<any>(cityPlan.routes));
    useContextProvider(ResponseContext, contentResponse);

    useWaitOn(
      loadRoute(cityPlan.routes, routeLocation.pathname)
        .then((loadedRoute) => {
          if (loadedRoute) {
            const contentModules = loadedRoute.modules;
            const pageModule = contentModules[contentModules.length - 1] as PageModule;
            const resolvedHead = resolveHead(routeLocation, contentModules);

            documentHead.links = resolvedHead.links;
            documentHead.meta = resolvedHead.meta;
            documentHead.styles = resolvedHead.styles;
            documentHead.title = resolvedHead.title;

            content.breadcrumbs = pageModule.breadcrumbs;
            content.headings = pageModule.headings;
            content.modules = noSerialize<any>(contentModules);

            routeLocation.params = { ...loadedRoute.params };
          }
        })
        .catch((e) => console.error(e))
    );

    return () => jsx(SkipRerender, {});
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {
  cityPlan: QwikCityPlan;
}
