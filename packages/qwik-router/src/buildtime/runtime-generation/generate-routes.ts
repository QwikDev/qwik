import type { QwikManifest, QwikVitePlugin } from '@qwik.dev/core/optimizer';
import { getPathnameFromDirPath, isModuleExt, isPageExt, removeExtension } from '../../utils/fs';
import type { RoutingContext, BuiltRoute } from '../types';
import { getImportPath } from './utils';

export function createRoutes(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  c: string[],
  esmImports: string[],
  isSSR: boolean
) {
  const includeEndpoints = isSSR;
  const dynamicImports = ctx.dynamicImports;

  if (ctx.layouts.length > 0) {
    c.push(`\n/** Qwik Router Layouts (${ctx.layouts.length}) */`);
    for (const layout of ctx.layouts) {
      const importPath = JSON.stringify(getImportPath(layout.filePath));
      if (dynamicImports) {
        c.push(`const ${layout.id} = ()=>import(${importPath});`);
      } else {
        esmImports.push(`import * as ${layout.id}_ from ${importPath};`);
        c.push(`const ${layout.id} = ()=>${layout.id}_;`);
      }
    }
  }

  c.push(`\n/** Qwik Router Routes (${ctx.routes.length}) */`);
  c.push(`export const routes = [`);

  for (const route of ctx.routes) {
    const layouts = [];

    if (isPageExt(route.ext)) {
      // page module or markdown
      for (const layout of route.layouts) {
        layouts.push(layout.id);
      }

      const importPath = getImportPath(route.filePath);
      if (dynamicImports) {
        layouts.push(`()=>import(${JSON.stringify(importPath)})`);
      } else {
        esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
        layouts.push(`()=>${route.id}`);
      }
    } else if (includeEndpoints && isModuleExt(route.ext)) {
      // include endpoints, and this is a module
      const importPath = getImportPath(route.filePath);
      esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
      for (const layout of route.layouts) {
        layouts.push(layout.id);
      }
      layouts.push(`()=>${route.id}`);
    }

    if (layouts.length > 0) {
      c.push(`  ${createRouteData(qwikPlugin, route, layouts, isSSR)},`);
    }
  }

  c.push(`];`);
}

function createRouteData(
  qwikPlugin: QwikVitePlugin,
  r: BuiltRoute,
  layouts: string[],
  isSsr: boolean
) {
  const routeName = JSON.stringify(r.routeName);
  const moduleLayouts = `[ ${layouts.join(', ')} ]`;

  // Use RouteData interface

  if (isSsr) {
    const originalPathname = JSON.stringify(r.pathname);
    const clientBundleNames = JSON.stringify(getClientRouteBundleNames(qwikPlugin, r));

    // SSR also adds the originalPathname and clientBundleNames to the RouteData
    //  ["qwikrouter-test/loaders-serialization/", [Layout, () => __vitePreload(() => import("./index58.js"), true ? [] : void 0)]],
    return `[ ${routeName}, ${moduleLayouts}, ${originalPathname}, ${clientBundleNames} ]`;
  }

  // simple RouteData, only route name and module loaders
  return `[ ${routeName}, ${moduleLayouts} ]`;
}

// TODO is this still used? We have the preloader now. Maybe this is what generates the data for it?
function getClientRouteBundleNames(qwikPlugin: QwikVitePlugin, r: BuiltRoute) {
  const bundlesNames: string[] = [];

  const manifest: QwikManifest = qwikPlugin.api.getManifest()!;
  if (manifest) {
    const manifestBundleNames = Object.keys(manifest.bundles);

    const addRouteFile = (filePath: string) => {
      filePath = removeExtension(filePath);

      for (const bundleName of manifestBundleNames) {
        const bundle = manifest.bundles[bundleName];
        if (bundle.origins) {
          for (const bundleOrigin of bundle.origins) {
            const originPath = removeExtension(bundleOrigin);
            if (filePath.endsWith(originPath)) {
              if (!bundlesNames.includes(bundleName)) {
                bundlesNames.push(bundleName);
              }
            }
          }
        }
      }
    };

    for (const layout of r.layouts) {
      addRouteFile(layout.filePath);
    }
    addRouteFile(r.filePath);
  }

  return bundlesNames;
}

export function createLoaderIdToRoute(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  c: string[]
) {
  const manifest = qwikPlugin.api.getManifest();
  const loaderSymbols: Record<string, string> = {};
  const mainDir = ctx.routes[0].routeName;
  const routesDir = ctx.opts.routesDir.split('/').pop()!;

  if (manifest) {
    for (const symbolData of Object.values(manifest.symbols)) {
      if (symbolData.ctxName === 'routeLoader$') {
        // extract file name from origin
        const fileName = symbolData.origin.split('/').pop();
        if (!fileName) {
          console.warn(`File name not found for loader: ${symbolData.origin}`);
          continue;
        }

        const filePath =
          mainDir +
          symbolData.origin
            .replace(routesDir, '')
            .replace(fileName, '')
            // remove trailing slash
            .substring(1);

        const routePath = getPathnameFromDirPath(ctx.opts, filePath);
        const route = ctx.routes.find((r) => r.pathname === routePath);
        if (route) {
          // everything fine, route exists we can use that
          loaderSymbols[symbolData.hash] = routePath;
        } else {
          /**
           * Route not found, we need to get first available route this is the case for folders with
           * layout files only like:
           *
           * ```
           * layout-only/
           * ├─ inner-route/
           * │ └─ index.tsx
           * └─ layout.tsx
           * ```
           */
          const firstRoute = ctx.routes.find((r) => r.pathname.startsWith(filePath));
          if (firstRoute) {
            loaderSymbols[symbolData.hash] = firstRoute.pathname;
          } else {
            console.warn(`Route not found for loader: ${symbolData.origin}`);
          }
        }
      }
    }
  }

  c.push(`export const loaderIdToRoute = ${JSON.stringify(loaderSymbols)};`);
}
