import type { QwikBundle, QwikManifest } from '@qwik.dev/core/optimizer';
import { removeExtension } from '../../utils/fs';
import type { BuiltRoute } from '../types';
import { QWIK_ROUTER_CONFIG_ID } from './plugin';

export function getRouteImports(routes: BuiltRoute[], manifest: QwikManifest) {
  const result: Record<string, { imports?: string[]; dynamicImports?: string[] }> = {};
  const configBundleName = Object.keys(manifest.bundles).find((name) =>
    manifest.bundles[name].origins?.some((origin) => origin.endsWith(QWIK_ROUTER_CONFIG_ID))
  );
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
      bundles.sort(
        (a, b) =>
          Number(isBundlePartOfRoute(manifest.bundles[b], [routePath])) -
          Number(isBundlePartOfRoute(manifest.bundles[a], [routePath]))
      );
      const renderRoots = Object.entries(manifest.symbols || {}).filter(
        ([, symbol]) =>
          symbol.ctxName === 'component$' &&
          !symbol.parent &&
          isBundlePartOfRoute({ origins: [symbol.origin] }, routeAndLayoutPaths)
      );
      renderRoots.sort(
        ([, a], [, b]) =>
          Number(isBundlePartOfRoute({ origins: [b.origin] }, [routePath])) -
          Number(isBundlePartOfRoute({ origins: [a.origin] }, [routePath]))
      );
      for (const [name] of renderRoots) {
        const renderBundle = manifest.mapping[name];
        if (renderBundle && !bundles.includes(renderBundle)) {
          bundles.push(renderBundle);
        }
      }
      result[route.routeName] = {
        imports: configBundleName ? [configBundleName, ...bundles] : bundles,
      };
    }
  });
  if (configBundleName) {
    const bundle = manifest.bundles[configBundleName];
    result[configBundleName] = {
      ...bundle,
      dynamicImports: bundle.dynamicImports?.filter((d) =>
        manifest.bundles[d].origins?.some((s) => s.endsWith('menu.md'))
      ),
    };
  }
  return result;
}

function isBundlePartOfRoute(bundle: Pick<QwikBundle, 'origins'>, routeAndLayoutPaths: string[]) {
  if (!bundle.origins) {
    return false;
  }
  return bundle.origins.some((bundleOrigin) => {
    const originPath = removeExtension(bundleOrigin);
    return routeAndLayoutPaths.some((path) => path.endsWith(originPath));
  });
}
