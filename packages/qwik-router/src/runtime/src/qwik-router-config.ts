import type { MenuData, RouteData, RouteModule } from './types';

// Generated at build time
export const routes: RouteData[] = [];
export const menus: MenuData[] = [];
export const serverPlugins: RouteModule[] = [];
export const trailingSlash = !globalThis.__NO_TRAILING_SLASH__;
export const basePathname = '/';
export const cacheModules = false;
export const loaderIdToRoute: Record<string, string> = {};

export default {
  routes,
  menus,
  trailingSlash,
  basePathname,
  cacheModules,
  loaderIdToRoute,
};
