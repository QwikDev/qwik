import { MODULE_CACHE } from './constants';
import { matchRoute } from './route-matcher';
import {
  type ContentMenu,
  type LoadedRoute,
  type MenuData,
  MenuDataProp,
  type MenuModule,
  type ModuleLoader,
  type RouteData,
  RouteDataProp,
  type RouteModule,
} from './types';
import { deepFreeze } from './deepFreeze';

/** LoadRoute() runs in both client and server. */
export const loadRoute = async (
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string
): Promise<LoadedRoute | null> => {
  if (!Array.isArray(routes)) {
    return null;
  }
  for (const routeData of routes) {
    const routeName = routeData[RouteDataProp.RouteName];
    const params = matchRoute(routeName, pathname);
    if (!params) {
      continue;
    }
    const loaders = routeData[RouteDataProp.Loaders];
    const routeBundleNames = routeData[RouteDataProp.RouteBundleNames];
    const modules: RouteModule[] = new Array(loaders.length);
    const pendingLoads: Promise<any>[] = [];

    loaders.forEach((moduleLoader, i) => {
      loadModule<RouteModule>(
        moduleLoader,
        pendingLoads,
        (routeModule) => (modules[i] = routeModule),
        cacheModules
      );
    });

    const menuLoader = getMenuLoader(menus, pathname);
    let menu: ContentMenu | undefined = undefined;

    loadModule<MenuModule>(
      menuLoader,
      pendingLoads,
      (menuModule) => (menu = menuModule?.default),
      cacheModules
    );

    if (pendingLoads.length > 0) {
      await Promise.all(pendingLoads);
    }

    return [routeName, params, modules, deepFreeze(menu), routeBundleNames];
  }
  return null;
};

const loadModule = <T>(
  moduleLoader: ModuleLoader | undefined,
  pendingLoads: Promise<any>[],
  moduleSetter: (loadedModule: T) => void,
  cacheModules: boolean | undefined
) => {
  if (typeof moduleLoader === 'function') {
    const loadedModule = MODULE_CACHE.get(moduleLoader);
    if (loadedModule) {
      moduleSetter(loadedModule);
    } else {
      const moduleOrPromise: any = moduleLoader();
      if (typeof moduleOrPromise.then === 'function') {
        pendingLoads.push(
          moduleOrPromise.then((loadedModule: any) => {
            if (cacheModules !== false) {
              MODULE_CACHE.set(moduleLoader, loadedModule);
            }
            moduleSetter(loadedModule);
          })
        );
      } else if (moduleOrPromise) {
        moduleSetter(moduleOrPromise);
      }
    }
  }
};

export const getMenuLoader = (menus: MenuData[] | undefined, pathname: string) => {
  if (menus) {
    pathname = pathname.endsWith('/') ? pathname : pathname + '/';
    const menu = menus.find(
      (m) =>
        m[MenuDataProp.Pathname] === pathname ||
        pathname.startsWith(m[MenuDataProp.Pathname] + (pathname.endsWith('/') ? '' : '/'))
    );
    if (menu) {
      return menu[MenuDataProp.MenuLoader];
    }
  }
};
