import {
  useWaitOn,
  useContextProvider,
  immutable,
  useSequentialScope,
  useStore,
  Host,
  jsx,
  noSerialize,
  component$,
} from '@builder.io/qwik';
import type {
  ContentModule,
  HeadComponentProps,
  Page,
  QwikCityOptions,
  QwikCityRoot,
  Route,
} from './types';
import { createContentCmp, updateContent } from './content';
import { loadRoute, matchRoute } from './routing';
import { JsxSkipRerender, PageContext, RouteContext } from './constants';
import { useLocation } from './use-location';
import { findJsxNode } from './jsx';
import { createHeadCmp, resolveHeadProps } from './head';

export const useQwikCity = (opts: QwikCityOptions) => {};

/**
 * @public
 */
export const createQwikCity = (opts: QwikCityOptions, app: (root: QwikCityRoot) => any) => {
  const userRoot: any = noSerialize(app);

  const qwikCity = {
    Head: () => jsx('head', null),
    Content: () => null,
    headProps: { resolved: {} } as HeadComponentProps,
  };

  const root: QwikCityRoot = {
    Head: () => qwikCity.Head(),
    Content: () => qwikCity.Content(),
    resolveHead: () => qwikCity.headProps.resolved,
  };

  return component$(
    () => {
      const loc = useLocation();

      const route = useStore(() => {
        const matchedRoute = matchRoute(opts.routes, loc.pathname);
        const initRoute: Route = {
          params: matchedRoute ? matchedRoute.params : {},
          pathname: loc.pathname,
        };
        return initRoute;
      });

      const page = useStore<Page>({} as any);

      const contentModules = useStore<{ modules: ContentModule[] }>({ modules: [] });

      const { get, set } = useSequentialScope();
      if (get) {
        return JsxSkipRerender;
      }

      set(true);

      useContextProvider(PageContext, page);
      useContextProvider(RouteContext, route);

      useWaitOn(
        loadRoute(opts.routes, loc.pathname)
          .then(updateContent)
          .then((updatedContent) => {
            if (updatedContent) {
              const updatedRoute: Route = {
                params: updatedContent.params,
                pathname: updatedContent.pathname,
              };

              Object.assign(route, updatedRoute);
              Object.assign(page, updatedContent.page);
              contentModules.modules = noSerialize(updatedContent.modules) as any;

              const headCmpProps = resolveHeadProps(route, page, updatedContent.modules);

              qwikCity.headProps = headCmpProps;
              qwikCity.Head = createHeadCmp(headCmpProps);
              qwikCity.Content = createContentCmp(updatedContent.modules);

              immutable(page);
            }
          })
          .catch((e) => console.error(e))
      );

      return () => {
        const userJsx = userRoot(root);

        const html = findJsxNode('html', userJsx);
        const htmlProps = html ? html.props : null;

        const head = findJsxNode('head', userJsx);
        const headProps = head ? head.props : null;
        const headChildren = headProps ? headProps.children : null;

        const body = findJsxNode('body', userJsx);
        const bodyProps = body ? body.props : null;
        const bodyChildren = bodyProps ? bodyProps.children : null;

        return jsx(Host, {
          ...htmlProps,
          children: [
            jsx('head', { ...headProps, children: headChildren }),
            jsx('body', { ...bodyProps, children: bodyChildren }),
          ],
        });
      };
    },
    { tagName: 'html' }
  );
};
