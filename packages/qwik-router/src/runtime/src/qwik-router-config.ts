import type { RouteData, RouteModule } from './types';

// Generated at build time
export const routes: RouteData = {};
export const serverPlugins: RouteModule[] = [];
export const trailingSlash = !globalThis.__NO_TRAILING_SLASH__;
// Build-time replaced by the router vite plugin's `define`; '/' outside app builds.
export const basePathname = globalThis.__QWIK_ROUTER_BASE_PATHNAME__ ?? '/';
export const cacheModules = false;
export const fallthrough = false;

export default {
  routes,
  serverPlugins,
  trailingSlash,
  basePathname,
  cacheModules,
  fallthrough,
};
