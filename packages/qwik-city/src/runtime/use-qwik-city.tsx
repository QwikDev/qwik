import {
  useWaitOn,
  useContextProvider,
  immutable,
  useSequentialScope,
  useStore,
} from '@builder.io/qwik';
import type { ContentModules, Page, QwikCityOptions, Route } from './types';
import { updateContent } from './content';
import { loadRoute, matchRoute } from './routing';
import { ContentContext, PageContext, RouteContext } from './constants';
import { useLocation } from './use-location';

/**
 * @alpha
 */
export const useQwikCity = ({ routes }: QwikCityOptions) => {
  const loc = useLocation();

  const route = useStore(() => {
    const matchedRoute = matchRoute(routes, loc.pathname);
    const initRoute: Route = {
      params: matchedRoute ? matchedRoute.params : {},
      pathname: loc.pathname,
    };
    return initRoute;
  });

  const [value, setValue] = useSequentialScope();
  if (value) {
    return;
  }

  setValue(true);

  const page = useStore<Page>({} as any);
  const contentCtx = useStore<ContentModules>({ modules: [] });

  useContextProvider(PageContext, page);
  useContextProvider(RouteContext, route);
  useContextProvider(ContentContext, contentCtx);

  useWaitOn(
    loadRoute(routes, loc.pathname)
      .then(updateContent)
      .then((updatedContent) => {
        if (updatedContent) {
          const updatedRoute: Route = {
            params: updatedContent.params,
            pathname: updatedContent.pathname,
          };

          Object.assign(route, updatedRoute);
          Object.assign(page, updatedContent.page);
          contentCtx.modules = updatedContent.modules;

          immutable(page);
        }
      })
  );
};
