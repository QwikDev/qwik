import {
  useWaitOn,
  useContextProvider,
  immutable,
  useSequentialScope,
  jsx,
  SkipRerender,
  useStore,
} from '@builder.io/qwik';
import type {
  LayoutModule,
  Page,
  PageHead,
  PageModule,
  QwikCity,
  QwikCityOptions,
  Route,
  RouteParams,
} from './types';
import { createHead } from './head';
import { createContent } from './content';
import { matchRoute } from './routing';
import { PageContext, RouteContext } from './constants';
import { useLocation } from './use-location';

/**
 * @alpha
 */
export const useQwikCity = ({ routes }: QwikCityOptions) => {
  const page: Page = {} as any; // useStore<Page>()

  const cmps = {
    Head: jsx(SkipRerender, {}) as any,
    Content: jsx(SkipRerender, {}) as any,
  };

  const loc = useLocation();

  const route = useStore<Route>({
    params: {},
    href: loc.href,
    pathname: loc.pathname,
    search: loc.search,
    hash: loc.href,
    origin: loc.origin,
  });

  const qwikCity: QwikCity = {
    Head: cmps.Head,
    Content: cmps.Content,
    page: page,
    route,
  };

  const [value, setValue] = useSequentialScope();
  if (value) {
    return qwikCity;
  }

  setValue(true);

  const update = (
    updatedModules: (PageModule | LayoutModule)[],
    updatedPageModule: PageModule,
    updatedPageHead: PageHead,
    updatedParams: RouteParams
  ) => {
    Object.assign(route, {
      params: updatedParams,
      href: loc.href,
      pathname: loc.pathname,
      search: loc.search,
      hash: loc.href,
      origin: loc.origin,
    } as Route);

    Object.assign(page, {
      breadcrumbs: updatedPageModule.breadcrumbs,
      head: updatedPageHead,
      headings: updatedPageModule.headings,
      menu: updatedPageModule.menu,
    } as Page);

    immutable(page);

    cmps.Head = createHead(updatedModules);
    cmps.Content = createContent(updatedModules);
  };

  useWaitOn(
    matchRoute(routes, route.href).then((updatedRoute) => {
      if (updatedRoute) {
        const updateModules = updatedRoute.modules;
        const updatedPageModule = updateModules[updateModules.length - 1];
        const updatedRouteParams = updatedRoute.params;

        const updatedHead =
          typeof updatedPageModule.head === 'function'
            ? updatedPageModule.head()
            : updatedPageModule.head;

        if (typeof updatedHead.then === 'function') {
          updatedHead.then((head: PageHead) =>
            update(updateModules, updatedPageModule, head, updatedRouteParams)
          );
        } else {
          update(updateModules, updatedPageModule, updatedHead, updatedRouteParams);
        }
      }
    })
  );

  useContextProvider(PageContext, page);
  useContextProvider(RouteContext, route);

  return qwikCity;
};
