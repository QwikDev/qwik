import type { QwikBundle, QwikManifest } from '@qwik.dev/core/optimizer';
import { removeExtension } from '../../utils/fs';
import type { BuiltRoute } from '../types';
import { QWIK_ROUTER_CONFIG_ID } from './plugin';

export function getRouteImports(routes: BuiltRoute[], manifest: QwikManifest) {
  const result: Record<string, { imports?: string[]; dynamicImports?: string[] }> = {};
  routes.forEach((route) => {
    const routePath = removeExtension(route.filePath);
    const layoutPaths = route.layouts
      ? route.layouts.map((layout) => removeExtension(layout.filePath))
      : [];
    const routeAndLayoutPaths = [routePath, ...layoutPaths];

    const bundles = [];

    for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
      if (isBundlePartOfRoute(bundle, routeAndLayoutPaths)) {
        bundles.push(bundleName);
      }
    }
    if (bundles.length > 0) {
      result[route.routeName] = { dynamicImports: bundles };
    }
  });
  for (const bundleName of Object.keys(manifest.bundles)) {
    const bundle = manifest.bundles[bundleName];
    if (bundle.origins?.some((s) => s.endsWith(QWIK_ROUTER_CONFIG_ID))) {
      result[bundleName] = {
        ...bundle,
        dynamicImports: bundle.dynamicImports?.filter((d) =>
          manifest.bundles[d].origins?.some((s) => s.endsWith('menu.md'))
        ),
      };
      break;
    }
  }
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
