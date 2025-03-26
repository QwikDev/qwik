import type { QwikBundle, QwikManifest } from '@builder.io/qwik/optimizer';
import { removeExtension } from '../../utils/fs';
import type { BuildRoute } from '../types';

export function getRouteImports(routes: BuildRoute[], manifest: QwikManifest) {
  const result: Record<string, { imports?: string[] }> = {};
  routes.forEach((route) => {
    const routePath = removeExtension(route.filePath);
    const layoutPaths = route.layouts
      ? route.layouts.map((layout) => removeExtension(layout.filePath))
      : [];
    const routeAndLayoutPaths = [routePath, ...layoutPaths];

    const imports = [];

    for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
      if (isBundlePartOfRoute(bundle, routeAndLayoutPaths)) {
        imports.push(bundleName);
      }
    }
    if (imports.length > 0) {
      result[route.routeName] = { imports };
    }
  });
  return result;
}

function isBundlePartOfRoute(bundle: QwikBundle, routeAndLayoutPaths: string[]) {
  if (!bundle.origins) {
    return false;
  }
  for (const bundleOrigin of bundle.origins) {
    const originPath = removeExtension(bundleOrigin);
    return routeAndLayoutPaths.some((path) => path.endsWith(originPath));
  }
}
