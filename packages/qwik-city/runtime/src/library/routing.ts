import { MODULE_CACHE } from './constants';
import type { LoadedRoute, MatchedRoute, RouteData, RouteParams } from './types';

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
  pathname: string
): Promise<LoadedRoute | null> => {
  const matchedRoute = matchRoute(routes, pathname);

  if (matchedRoute) {
    const moduleLoaders = matchedRoute.loaders;
    const modules = new Array(moduleLoaders.length);
    const pendingLoads: Promise<any>[] = [];

    moduleLoaders.forEach((moduleLoader, i) => {
      let mod = MODULE_CACHE.get(moduleLoader);
      if (!mod) {
        mod = moduleLoader();
        if (typeof mod.then === 'function') {
          pendingLoads.push(
            mod.then((loadedModule: any) => {
              modules[i] = loadedModule;
              MODULE_CACHE.set(moduleLoader, loadedModule);
            })
          );
        }
      }
      modules[i] = mod;
    });

    if (pendingLoads.length > 0) {
      await Promise.all(pendingLoads);
    }

    return { ...matchedRoute, modules };
  }

  return null;
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
