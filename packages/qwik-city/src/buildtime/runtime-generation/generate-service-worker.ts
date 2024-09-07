import type { InsightManifest, QwikManifest } from '@builder.io/qwik/optimizer';
import type { AppBundle } from '../../runtime/src/service-worker/types';
import { removeExtension } from '../../utils/fs';
import type { BuildContext } from '../types';

export function generateServiceWorkerRegister(ctx: BuildContext, swRegister: string) {
  let swReg: string;

  if (ctx.isDevServer) {
    swReg = SW_UNREGISTER;
  } else {
    swReg = swRegister;

    let swUrl = '/service-worker.js';
    if (ctx.serviceWorkers.length > 0) {
      const sw = ctx.serviceWorkers.sort((a, b) =>
        a.chunkFileName.length < b.chunkFileName.length ? -1 : 1
      )[0];
      swUrl = ctx.opts.basePathname + sw.chunkFileName;
    }

    swReg = swReg.replace('__url', swUrl);
  }

  return `export default ${JSON.stringify(swReg)};`;
}

export function prependManifestToServiceWorker(
  ctx: BuildContext,
  manifest: QwikManifest,
  prefetch: InsightManifest['prefetch'] | null,
  swCode: string
) {
  const key = `/* Qwik Service Worker */`;
  if (swCode.includes(key)) {
    // both SSR and SSG could have ran this code,
    // just check if we already prepended the bundles
    return null;
  }

  // TODO: add dynamic imports that don't import routes
  // (anything that doesn't contain _hw export)

  const appBundles: AppBundle[] = [];
  const appBundlesCode = generateAppBundles(appBundles, manifest);
  const libraryBundlesCode = generateLibraryBundles(appBundles, manifest);
  const [linkBundlesCode] = generateLinkBundles(ctx, appBundles, manifest, prefetch);

  return [key, appBundlesCode, libraryBundlesCode, linkBundlesCode, swCode].join('\n');
}

export function generateAppBundles(appBundles: AppBundle[], manifest: QwikManifest) {
  const sortedBundles = Object.keys(manifest.bundles).sort();
  for (const appBundleName of sortedBundles) {
    const appBundle: AppBundle = [appBundleName, []];
    appBundles.push(appBundle);

    const symbolHashesInBundle: string[] = [];

    const manifestBundle = manifest.bundles[appBundleName];
    const importedBundleNames = Array.isArray(manifestBundle.imports) ? manifestBundle.imports : [];

    const depsSet = new Set(importedBundleNames);

    for (const importedBundleName of importedBundleNames) {
      clearTransitiveDeps(depsSet, new Set(), importedBundleName);
    }
    // set the imports based on the sorted index number
    appBundle[1] = Array.from(depsSet).map((dep) => sortedBundles.indexOf(dep));

    if (manifestBundle.symbols) {
      for (const manifestBundleSymbolName of manifestBundle.symbols) {
        const symbol = manifest.symbols[manifestBundleSymbolName];
        if (symbol?.hash && !symbolHashesInBundle.includes(symbol.hash)) {
          symbolHashesInBundle.push(symbol.hash);
        }
      }
    }

    if (symbolHashesInBundle.length > 0) {
      (appBundle as unknown as any)[2] = symbolHashesInBundle;
    }
  }

  function clearTransitiveDeps(deps: Set<string>, seen: Set<string>, depName: string) {
    const childBundle = manifest.bundles[depName];

    for (const childDepImport of childBundle.imports || []) {
      if (deps.has(childDepImport)) {
        deps.delete(childDepImport);
      }
      if (!seen.has(childDepImport)) {
        seen.add(childDepImport);
        clearTransitiveDeps(deps, seen, childDepImport);
      }
    }
  }

  return `const appBundles=${JSON.stringify(appBundles)};`;
}

function generateLibraryBundles(appBundles: AppBundle[], manifest: QwikManifest) {
  const libraryBundleIds: number[] = [];

  for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
    if (bundle.origins && bundle.origins.includes('@qwik-city-plan')) {
      libraryBundleIds.push(getAppBundleIndex(appBundles, bundleName));
      break;
    }
  }

  return `const libraryBundleIds=${JSON.stringify(libraryBundleIds)};`;
}

export function generateLinkBundles(
  ctx: BuildContext,
  appBundles: AppBundle[],
  manifest: QwikManifest,
  prefetch: InsightManifest['prefetch'] | null
) {
  const linkBundles: string[] = [];
  const symbolToBundle = new Map<string, string>();
  const routeToBundles: Record<string, string[]> = {};
  for (const bundleName in manifest.bundles || []) {
    manifest.bundles[bundleName].symbols?.forEach((symbol) => {
      const idx = symbol.lastIndexOf('_');
      symbolToBundle.set(idx === -1 ? symbol : symbol.substring(idx + 1), bundleName);
    });
  }

  for (const r of ctx.routes) {
    const linkBundleNames: string[] = [];

    const addFileBundles = (filePath: string) => {
      for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
        if (bundle.origins) {
          for (const bundleOrigin of bundle.origins) {
            const srcPath = removeExtension(filePath);
            const bundleOriginPath = removeExtension(bundleOrigin);

            if (srcPath.endsWith(bundleOriginPath)) {
              if (!linkBundleNames.includes(bundleName)) {
                linkBundleNames.push(bundleName);
              }

              if (bundle.dynamicImports) {
                for (const dynamicImport of bundle.dynamicImports) {
                  if (!linkBundleNames.includes(dynamicImport)) {
                    linkBundleNames.push(dynamicImport);
                  }
                }
              }
            }
          }
        }
      }
    };

    for (const layout of r.layouts) {
      addFileBundles(layout.filePath);
    }
    addFileBundles(r.filePath);

    if (prefetch) {
      // process the symbols from insights prefetch
      const symbolsForRoute = prefetch.find((p) => p.route === r.routeName);
      symbolsForRoute?.symbols?.reverse().forEach((symbol) => {
        const bundle = symbolToBundle.get(symbol);
        if (bundle) {
          const idx = linkBundleNames.indexOf(bundle);
          if (idx !== -1) {
            linkBundleNames.splice(idx, 1);
          }
          linkBundleNames.unshift(bundle);
        }
      });
    }

    linkBundles.push(
      `[${r.pattern.toString()},${JSON.stringify(
        linkBundleNames.map((bundleName) => getAppBundleIndex(appBundles, bundleName))
      )}]`
    );
    routeToBundles[r.routeName] = linkBundleNames;
  }

  return [`const linkBundles=[${linkBundles.join(',')}];`, routeToBundles] as [
    string,
    typeof routeToBundles,
  ];
}

function getAppBundleIndex(appBundles: AppBundle[], bundleName: string) {
  return appBundles.findIndex((b) => b[0] === bundleName);
}

const SW_UNREGISTER = `
navigator.serviceWorker?.getRegistrations().then((regs) => {
  for (const reg of regs) {
    reg.unregister();
  }
});
`;
