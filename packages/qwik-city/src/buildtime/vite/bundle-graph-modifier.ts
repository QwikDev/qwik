import type { QwikBundleGraph, QwikManifest } from '@builder.io/qwik/optimizer';
import { removeExtension } from '../../utils/fs';
import type { BuildRoute } from '../types';

export function modifyBundleGraph(
  routes: BuildRoute[],
  originalGraph: QwikBundleGraph,
  manifest: QwikManifest
) {
  const graph = [...originalGraph, -2];
  routes.forEach((route) => {
    const routePath = removeExtension(route.filePath);
    const layoutPaths = route.layouts
      ? route.layouts.map((layout) => removeExtension(layout.filePath))
      : [];
    const routeAndLayoutPaths = [routePath, ...layoutPaths];

    graph.push(route.routeName);

    for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
      if (!bundle.origins) {
        continue;
      }
      for (const bundleOrigin of bundle.origins) {
        const originPath = removeExtension(bundleOrigin);
        if (routeAndLayoutPaths.some((path) => path.endsWith(originPath))) {
          graph.push(originalGraph.indexOf(bundleName));
        }
      }
    }
  });
  return graph;
}
