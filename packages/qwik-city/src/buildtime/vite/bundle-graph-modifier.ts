import type { QwikBundle, QwikBundleGraph, QwikManifest } from '@builder.io/qwik/optimizer';
import { removeExtension } from '../../utils/fs';
import type { BuildRoute } from '../types';

export function modifyBundleGraph(
  routes: BuildRoute[],
  originalGraph: QwikBundleGraph,
  manifest: QwikManifest
) {
  const ROUTES_SEPARATOR = -2;

  const graph = [...originalGraph, ROUTES_SEPARATOR];

  routes.forEach((route) => {
    const routePath = removeExtension(route.filePath);
    const layoutPaths = route.layouts
      ? route.layouts.map((layout) => removeExtension(layout.filePath))
      : [];
    const routeAndLayoutPaths = [routePath, ...layoutPaths];

    graph.push(route.routeName);

    for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
      if (isBundlePartOfRoute(bundle, routeAndLayoutPaths)) {
        const bundleIndex = originalGraph.indexOf(bundleName);
        if (bundleIndex !== -1) {
          graph.push(originalGraph.indexOf(bundleName));
        }
      }
    }
  });
  return graph;
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
