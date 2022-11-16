import type { BuildContext } from '../types';
import swRegister from '@qwik-city-sw-register-build';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type { AppBundle } from '../../runtime/src/service-worker/types';
import { removeExtension } from '../../utils/fs';

export function generateServiceWorkerRegister(ctx: BuildContext) {
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
  swCode: string
) {
  const key = `/* Qwik Service Worker */`;
  if (swCode.includes(key)) {
    // both SSR and SSG could have ran this code,
    // just check if we already prepended the bundles
    return null;
  }

  const appBundles: AppBundle[] = [];
  const appBundlesCode = generateAppBundles(appBundles, manifest);
  const libraryBundlesCode = generateLibraryBundles(appBundles, manifest);
  const linkBundlesCode = generateLinkBundles(ctx, appBundles, manifest);

  return [key, appBundlesCode, libraryBundlesCode, linkBundlesCode, swCode].join('\n');
}

function generateAppBundles(appBundles: AppBundle[], manifest: QwikManifest) {
  for (const appBundleName in manifest.bundles) {
    appBundles.push([appBundleName, []]);
  }

  for (const appBundle of appBundles) {
    const appBundleName = appBundle[0];
    const importedBundleIds = appBundle[1];
    const symbolHashesInBundle: string[] = [];

    const manifestBundle = manifest.bundles[appBundleName];
    const importedBundleNames = Array.isArray(manifestBundle.imports) ? manifestBundle.imports : [];
    for (const importedBundleName of importedBundleNames) {
      importedBundleIds.push(getAppBundleId(appBundles, importedBundleName));
    }

    if (manifestBundle.symbols) {
      for (const manifestBundleSymbolName of manifestBundle.symbols) {
        const symbol = manifest.symbols[manifestBundleSymbolName];
        if (symbol?.hash && !symbolHashesInBundle.includes(symbol.hash)) {
          symbolHashesInBundle.push(symbol.hash);
        }
      }
    }

    if (symbolHashesInBundle.length > 0) {
      appBundle[2] = symbolHashesInBundle;
    }
  }

  return `const appBundles=${JSON.stringify(appBundles)};`;
}

function generateLibraryBundles(appBundles: AppBundle[], manifest: QwikManifest) {
  const libraryBundleIds: number[] = [];

  for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
    if (bundle.origins && bundle.origins.includes('@qwik-city-plan')) {
      libraryBundleIds.push(getAppBundleId(appBundles, bundleName));
      break;
    }
  }

  return `const libraryBundleIds=${JSON.stringify(libraryBundleIds)};`;
}

function generateLinkBundles(ctx: BuildContext, appBundles: AppBundle[], manifest: QwikManifest) {
  const linkBundles: string[] = [];

  for (const r of ctx.routes) {
    const linkBundleNames: string[] = [];

    const addFileBundles = (filePath: string) => {
      for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
        if (bundle.origins) {
          for (const bundleOrigin of bundle.origins) {
            const srcPath = removeExtension(filePath);
            const bundleOrginPath = removeExtension(bundleOrigin);

            if (srcPath.endsWith(bundleOrginPath)) {
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

    linkBundles.push(
      `[${r.pattern.toString()},${JSON.stringify(
        linkBundleNames.map((bundleName) => getAppBundleId(appBundles, bundleName))
      )}]`
    );
  }

  return `const linkBundles=[${linkBundles.join(',')}];`;
}

function getAppBundleId(appBundles: AppBundle[], bundleName: string) {
  return appBundles.findIndex((b) => b[0] === bundleName);
}

const SW_UNREGISTER = `
navigator.serviceWorker.getRegistrations().then((regs) => {
  for (const reg of regs) {
    reg.unregister();
  }
});
`;
