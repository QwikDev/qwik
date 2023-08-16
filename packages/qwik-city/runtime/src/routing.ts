import { MODULE_CACHE } from './constants';
import { matchRoute } from './route-matcher';
import type {
  ContentMenu,
  LoadedRoute,
  MenuData,
  MenuModule,
  ModuleLoader,
  RouteData,
  RouteModule,
} from './types';

export const CACHE = new Map<RouteData, Promise<any>>();
/**
 * loadRoute() runs in both client and server.
 */
export const loadRoute = async (
  routes: RouteData[] | undefined,
  menus: MenuData[] | undefined,
  cacheModules: boolean | undefined,
  pathname: string
): Promise<LoadedRoute | null> => {
  if (Array.isArray(routes)) {
    for (const route of routes) {
      const routeName = route[0];
      const params = matchRoute(routeName, pathname);
      if (params) {
        const loaders = route[1];
        const routeBundleNames = route[3];
        const mods: RouteModule[] = new Array(loaders.length);
        const pendingLoads: Promise<any>[] = [];
        const menuLoader = getMenuLoader(menus, pathname);
        let menu: ContentMenu | undefined = undefined;

        loaders.forEach((moduleLoader, i) => {
          loadModule<RouteModule>(
            moduleLoader,
            pendingLoads,
            (routeModule) => (mods[i] = routeModule),
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

        return [routeName, params, mods, menu, routeBundleNames];
      }
    }
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
      const l: any = moduleLoader();
      if (typeof l.then === 'function') {
        pendingLoads.push(
          l.then((loadedModule: any) => {
            if (cacheModules !== false) {
              MODULE_CACHE.set(moduleLoader, loadedModule);
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

export const getMenuLoader = (menus: MenuData[] | undefined, pathname: string) => {
  if (menus) {
    pathname = pathname.endsWith('/') ? pathname : pathname + '/';
    const menu = menus.find(
      (m) => m[0] === pathname || pathname.startsWith(m[0] + (pathname.endsWith('/') ? '' : '/'))
    );
    if (menu) {
      return menu[1];
    }
  }
};
