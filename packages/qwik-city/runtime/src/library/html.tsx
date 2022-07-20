import {
  component$,
  Host,
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
import type { ContentState, PageModule, QwikCityRenderDocument } from './types';
import { ContentContext, DocumentHeadContext, RouteLocationContext } from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { getSsrEndpointResponse } from './use-endpoint';
import cityPlan from '@qwik-city-plan';
import { useLocation } from './use-functions';

export interface LinkProps {
  href: string;
}

export const Link = component$(
  (props: LinkProps) => {
    const loc = useLocation();

    return (
      <Host
        preventdefault:click
        onClick$={() => {
          loc.pathname = props.href;
        }}
      ></Host>
    );
  },
  { tagName: 'a' }
);

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  (props) => {
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
      contents: [],
      headings: undefined,
      menu: undefined,
    });

    useContextProvider(ContentContext, content);
    useContextProvider(DocumentHeadContext, documentHead);
    useContextProvider(RouteLocationContext, routeLocation);

    useWatch$(async (track) => {
      const pathname = track(routeLocation, 'pathname');
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

        documentHead.links = resolvedHead.links;
        documentHead.meta = resolvedHead.meta;
        documentHead.styles = resolvedHead.styles;
        documentHead.title = resolvedHead.title;

        content.headings = pageModule.headings;
        content.menu = loadedRoute.menu;
        content.contents = noSerialize<any>(contentModules);

        routeLocation.params = { ...loadedRoute.params };
      }
    });

    return () => jsx(SkipRerender, {});
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {}
