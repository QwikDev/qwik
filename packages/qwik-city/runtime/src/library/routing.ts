import { MODULE_CACHE } from './constants';
import type {
  ContentMenu,
  ContentModule,
  LoadedRoute,
  MatchedRoute,
  MenuData,
  MenuModule,
  RouteData,
  RouteParams,
} from './types';

export const matchRoute = (
  routes: RouteData[] | undefined,
  pathname: string
): MatchedRoute | null => {
  if (Array.isArray(routes)) {
    for (const route of routes) {
      const match = route[0].exec(pathname);
      if (match) {
        return {
          loaders: route[1],
          params: getRouteParams(route[2], match),
        };
      }
    }
  }
  return null;
};

export const loadRoute = async (
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string
): Promise<LoadedRoute | null> => {
  const matchedRoute = matchRoute(routes, pathname);

  if (matchedRoute) {
    const contentLoaders = matchedRoute.loaders;
    const contents: ContentModule[] = new Array(contentLoaders.length);
    const pendingLoads: Promise<any>[] = [];
    const menuLoader = getMenuLoader(menus, pathname);
    let menu: ContentMenu | undefined = undefined;

    contentLoaders.forEach((contentLoader, i) => {
      loadModule<ContentModule>(
        contentLoader,
        pendingLoads,
        (contentModule) => (contents[i] = contentModule),
        cacheModules
      );
    });

    loadModule<MenuModule>(
      menuLoader,
      pendingLoads,
      (menuModule) => (menu = menuModule?.default),
      cacheModules
    );

    if (pendingLoads.length > 0) {
      await Promise.all(pendingLoads);
    }

    return { ...matchedRoute, contents, menu };
  }

  return null;
};

const loadModule = <T>(
  loaderFn: (() => Promise<any>) | undefined,
  pendingLoads: Promise<any>[],
  moduleSetter: (loadedModule: T) => void,
  cacheModules: boolean | undefined
) => {
  if (typeof loaderFn === 'function') {
    const loadedModule = MODULE_CACHE.get(loaderFn);
    if (loadedModule) {
      moduleSetter(loadedModule);
    } else {
      const l: any = loaderFn();
      if (typeof l.then === 'function') {
        pendingLoads.push(
          l.then((loadedModule: any) => {
            if (cacheModules !== false) {
              MODULE_CACHE.set(loaderFn, loadedModule);
            }
            moduleSetter(loadedModule);
          })
        );
      } else if (l) {
        moduleSetter(l);
      }
    }
  }
};

const getMenuLoader = (menus: MenuData[] | undefined, pathname: string) => {
  if (menus) {
    const menu = menus.find((m) => m[0] === pathname || pathname.startsWith(m[0] + '/'));
    if (menu) {
      return menu[1];
    }
  }
  return undefined;
};

export const getRouteParams = (paramNames: string[] | undefined, match: RegExpExecArray | null) => {
  const params: RouteParams = {};

  if (Array.isArray(paramNames)) {
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]] = match ? match[i + 1] : '';
    }
  }

  return params;
};
