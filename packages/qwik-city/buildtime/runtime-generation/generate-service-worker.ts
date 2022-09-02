import type { BuildContext } from '../types';
import swRegister from '@qwik-city-sw-register-build';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type { AppBundles } from '../../runtime/src/library/service-worker/types';

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

export function prependManifestToServiceWorker(manifest: QwikManifest, swCode: string) {
  const key = `/* Qwik Service Worker */`;
  if (swCode.includes(key)) {
    // both SSR and SSG could have ran this code,
    // just check if we already prepended the bundles
    return null;
  }

  const appBundlesCode = generateAppBundles(manifest);

  return [key, appBundlesCode, swCode].join('\n');
}

function generateAppBundles(manifest: QwikManifest) {
  const appBundles: AppBundles = {};

  for (const appBundleName in manifest.bundles) {
    const manifestBundle = manifest.bundles[appBundleName];
    const importedBundleNames = Array.isArray(manifestBundle.imports) ? manifestBundle.imports : [];
    const symbolHashesInBundle = new Set<string>();

    if (manifestBundle.symbols) {
      for (const manifestBundleSymbolName of manifestBundle.symbols) {
        const symbol = manifest.symbols[manifestBundleSymbolName];
        if (symbol?.hash) {
          symbolHashesInBundle.add(symbol.hash);
        }
      }
    }

    appBundles[appBundleName] = [importedBundleNames, Array.from(symbolHashesInBundle)];
  }

  return `const appBundles=${JSON.stringify(appBundles)};`;
}

const SW_UNREGISTER = `
navigator.serviceWorker.getRegistrations().then((regs) => {
  for (const reg of regs) {
    reg.unregister();
  }
});
`;
