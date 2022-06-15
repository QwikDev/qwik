import { MODULE_CACHE } from './constants';
import type { RouteData, RouteParams } from './types';
import { normalizePathname } from './utils';

export const matchRoute = async (routes: RouteData[], href: string) => {
  const pathname = normalizePathname(href);

  for (const [pattern, moduleLoaders, paramNames] of routes) {
    const match = pattern.exec(pathname);
    if (match) {
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

      if (pendingLoads.length) {
        await Promise.all(pendingLoads);
      }

      return { modules, params: getRouteParams(paramNames, match) };
    }
  }

  return null;
};

export function getRouteParams(paramNames: string[] | undefined, match: RegExpExecArray | null) {
  const params: RouteParams = {};

  if (Array.isArray(paramNames)) {
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]] = match ? match[i + 1] : '';
    }
  }

  return params;
}
