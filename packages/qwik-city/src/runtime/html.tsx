import {
  component$,
  Host,
  HTMLAttributes,
  jsx,
  noSerialize,
  useContextProvider,
  useSequentialScope,
  useStore,
  useWaitOn,
} from '@builder.io/qwik';
import { updateContent } from './content';
import { JsxSkipRerender, QwikCityContext } from './constants';
import { loadRoute, matchRoute } from './routing';
import type { QwikCityState, Route, RouteData } from './types';
import { useLocation } from './use-functions';
import { resolveHeadProps } from './head';

/**
 * @public
 */
export const Html = component$<HtmlProps>(
  (props) => {
    const { get, set } = useSequentialScope();
    if (get) {
      return JsxSkipRerender;
    }
    set(true);

    const loc = useLocation();

    const ctx = useStore(() => {
      const matchedRoute = matchRoute(props.routes, loc.pathname);
      const initCtx: QwikCityState = {
        modules: noSerialize([]) as any,
        page: {},
        head: {
          title: '',
          links: [],
          meta: [],
          styles: [],
        },
        route: {
          params: matchedRoute ? matchedRoute.params : {},
          pathname: loc.pathname,
        },
      };
      return initCtx;
    });

    useContextProvider(QwikCityContext, ctx);

    useWaitOn(
      loadRoute(props.routes, loc.pathname)
        .then(updateContent)
        .then((updatedContent) => {
          if (updatedContent) {
            const route: Route = {
              params: updatedContent.params,
              pathname: updatedContent.pathname,
            };

            const headCmpProps = resolveHeadProps(
              route,
              updatedContent.page,
              updatedContent.modules
            );

            ctx.head = noSerialize(headCmpProps.resolved) as any;
            ctx.modules = noSerialize(updatedContent.modules) as any;
            ctx.page = noSerialize(updatedContent.page) as any;
            ctx.route = noSerialize(route) as any;
          }
        })
        .catch((e) => console.error(e))
    );

    return () => jsx(Host as any, null);
  },
  { tagName: 'html' }
);

export interface HtmlProps extends HTMLAttributes<HTMLHtmlElement> {
  routes: RouteData[];
}
