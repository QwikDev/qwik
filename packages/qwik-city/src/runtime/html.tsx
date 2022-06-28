import {
  component$,
  HTMLAttributes,
  jsx,
  noSerialize,
  SkipRerender,
  useContextProvider,
  useSequentialScope,
  useStore,
  useWaitOn,
} from '@builder.io/qwik';
import { updateContent } from './content';
import { QwikCityContext } from './constants';
import { loadRoute, matchRoute } from './routing';
import type { QwikCityPlan, QwikCityState } from './types';
import { useDocumentLocation } from './use-functions';
import { resolveHead } from './head';
import { searchParamsToObj } from './utils';

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

    const docLocation = useDocumentLocation();

    const ctx = useStore(() => {
      // init qwik city context
      const matchedRoute = matchRoute(cityPlan.routes, docLocation.pathname);
      const initCtx: QwikCityState = {
        breadcrumbs: undefined,
        head: {
          title: '',
          links: [],
          meta: [],
          styles: [],
        },
        headings: undefined,
        location: {
          hash: docLocation.hash,
          host: docLocation.host,
          hostname: docLocation.hostname,
          href: docLocation.href,
          origin: docLocation.origin,
          pathname: docLocation.pathname,
          port: docLocation.port,
          protocol: docLocation.protocol,
          routeParams: matchedRoute ? { ...matchedRoute.params } : {},
          search: docLocation.search,
          searchParams: searchParamsToObj(docLocation.searchParams),
        },
        menu: undefined,
        modules: noSerialize<any>([]),
      };
      return initCtx;
    });

    useContextProvider(QwikCityContext, ctx);

    useWaitOn(
      loadRoute(cityPlan.routes, docLocation.pathname)
        .then(updateContent)
        .then((updatedContent) => {
          if (updatedContent) {
            if (updatedContent.pathname !== ctx.location.pathname) {
              ctx.location = {
                ...ctx.location,
                pathname: updatedContent.pathname,
                routeParams: updatedContent.params,
              };
            }

            const resolvedHead = resolveHead(ctx.location, updatedContent);

            ctx.breadcrumbs =
              updatedContent.pageModule.breadcrumbs &&
              noSerialize<any>(updatedContent.pageModule.breadcrumbs);
            ctx.head = noSerialize<any>(resolvedHead);
            ctx.modules = noSerialize<any>(updatedContent.modules);
            ctx.menu =
              updatedContent.pageModule.menu && noSerialize<any>(updatedContent.pageModule.menu);
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
