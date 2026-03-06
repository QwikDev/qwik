import { i as o } from './build/build.js';
const s = [],
  t = () => import('./build/layout.js'),
  e = [
    ['/', [t, () => import('./build/index.js')], '/', []],
    ['react/', [t, () => import('./build/index2.js')], '/react/', []],
  ],
  r = [],
  n = !0,
  a = '/',
  c = !o,
  u = { routes: e, serverPlugins: s, menus: r, trailingSlash: n, basePathname: a, cacheModules: c };
export {
  a as basePathname,
  c as cacheModules,
  u as default,
  r as menus,
  e as routes,
  s as serverPlugins,
  n as trailingSlash,
};
