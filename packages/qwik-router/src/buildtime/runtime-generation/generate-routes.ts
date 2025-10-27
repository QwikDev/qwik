import type { QwikManifest, QwikVitePlugin } from '@qwik.dev/core/optimizer';
import { isModuleExt, isPageExt, removeExtension } from '../../utils/fs';
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
