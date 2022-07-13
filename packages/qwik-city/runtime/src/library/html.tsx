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
import { loadRoute } from './routing';
import type { ContentState, PageModule, QwikCityRenderDocument } from './types';
import {
  ContentContext,
  ContentMenusContext,
  DocumentHeadContext,
  RouteLocationContext,
} from './constants';
import { createDocumentHead, resolveHead } from './head';
import { getSsrEndpointResponse } from './use-endpoint';
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

    const doc = useDocument() as QwikCityRenderDocument;

    const routeLocation = useStore(() => {
      const initRouteLocation = doc?._qwikUserCtx?.qcRoute;
      if (!initRouteLocation) {
        throw new Error(`Missing Qwik City User Context`);
      }
      return initRouteLocation;
    });

    const documentHead = useStore(createDocumentHead);
    const content = useStore<ContentState>({
      breadcrumbs: undefined,
      headings: undefined,
      modules: [],
    });

    useContextProvider(ContentContext, content);
    useContextProvider(ContentMenusContext, cityPlan.menus || {});
    useContextProvider(DocumentHeadContext, documentHead);
    useContextProvider(RouteLocationContext, routeLocation);

    useWaitOn(
      loadRoute(cityPlan.routes, routeLocation.pathname)
        .then((loadedRoute) => {
          if (loadedRoute) {
            const contentModules = loadedRoute.modules;
            const pageModule = contentModules[contentModules.length - 1] as PageModule;
            const endpointResponse = getSsrEndpointResponse(doc);
            const resolvedHead = resolveHead(endpointResponse, routeLocation, contentModules);

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

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {}
