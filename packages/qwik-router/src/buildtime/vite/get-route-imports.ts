import type { QwikBundle, QwikManifest } from '@qwik.dev/core/optimizer';
import { removeExtension } from '../../utils/fs';
import { ensureSlash } from '../../utils/pathname';
import type { BuiltLayout, BuiltRoute } from '../types';
import { QWIK_ROUTER_CONFIG_ID } from './plugin';

export function getRouteImports(routes: BuiltRoute[], manifest: QwikManifest) {
  const result: Record<string, { imports?: string[]; dynamicImports?: string[] }> = {};
  const layouts = new Map<string, BuiltLayout>();
  routes.forEach((route) => {
    const bundles = getBundlesOfFile(manifest, route.filePath);
    if (bundles.length > 0) {
      // Runtime lookups always add the slash; catch-all names like `[...slug]` lack it.
      result[ensureSlash(route.routeName)] = { dynamicImports: bundles };
    }
    route.layouts?.forEach((layout) => layouts.set(layout.id, layout));
  });
  layouts.forEach((layout) => {
    const bundles = getBundlesOfFile(manifest, layout.filePath);
    if (bundles.length > 0) {
      result[layout.id] = { dynamicImports: bundles };
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
      addRouterConfigToItsImporters(manifest, bundleName, result);
      result[QWIK_ROUTER_CONFIG_ID] = { dynamicImports: [bundleName] };
      break;
    }
  }
  return result;
}

function addRouterConfigToItsImporters(
  manifest: QwikManifest,
  routerConfigBundleName: string,
  result: Record<string, { imports?: string[]; dynamicImports?: string[] }>
) {
  for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
    if (bundle.dynamicImports?.includes(routerConfigBundleName)) {
      result[bundleName] = {
        ...bundle,
        dynamicImports: [...(bundle.qrlImports ?? []), routerConfigBundleName],
      };
    }
  }
}

function getBundlesOfFile(manifest: QwikManifest, filePath: string) {
  const extlessFilePath = removeExtension(filePath);
  const bundles: string[] = [];
  for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
    if (isBundleOfFile(bundle, extlessFilePath)) {
      bundles.push(bundleName);
    }
  }
  return bundles;
}

function isBundleOfFile(bundle: QwikBundle, extlessFilePath: string) {
  if (!bundle.origins) {
    return false;
  }
  return bundle.origins.some((bundleOrigin) =>
    extlessFilePath.endsWith(removeExtension(bundleOrigin))
  );
}
