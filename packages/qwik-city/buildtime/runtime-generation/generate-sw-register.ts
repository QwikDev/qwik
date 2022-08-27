import type { BuildContext, BuildRoute } from '../types';
import swRegister from '@qwik-city-sw-register-build';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type { ServiceWorkerBundles } from '../../runtime/src/library/types';
import { isPageModuleExt } from '../../utils/fs';

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

  const bundlesCode = generateServiceWorkerBundles(manifest);
  const linksCode = generateServiceWorkerLinks(ctx, manifest);
  const libraryBundlesCode = generateServiceWorkerLibraryBundles(manifest);

  return [key, bundlesCode, linksCode, libraryBundlesCode, swCode].join('\n');
}

function generateServiceWorkerBundles(manifest: QwikManifest) {
  const bundles: ServiceWorkerBundles = {};

  for (const bundleName in manifest.bundles) {
    const bundle = manifest.bundles[bundleName];
    bundles[bundleName] = Array.isArray(bundle.imports) ? bundle.imports : [];
  }

  return `const bundles=${JSON.stringify(bundles)};`;
}

function generateServiceWorkerLinks(ctx: BuildContext, manifest: QwikManifest) {
  const links: string[] = [];

  for (const route of ctx.routes) {
    if (isPageModuleExt(route.ext)) {
      const pattern = route.pattern.toString();
      const bundleNames = getLinkBundleNames(ctx, manifest, route);
      links.push(`[${pattern},${JSON.stringify(bundleNames)}]`);
    }
  }

  return `const links=[${links.join(',')}];`;
}

// TODO: Better way to know qwik city library components
const knownLibraryNames = new Set([
  'QwikCity_component_useWatch',
  'RouterOutlet_component',
  'Link_component_a_onClick',
  'Link_component_a_onMouseOver',
]);

function generateServiceWorkerLibraryBundles(manifest: QwikManifest) {
  const libraryBundles = new Set<string>();

  for (const symbolName in manifest.symbols) {
    const symbol = manifest.symbols[symbolName];

    if (knownLibraryNames.has(symbol?.displayName)) {
      const bundleName = manifest.mapping[symbolName];
      if (bundleName) {
        libraryBundles.add(manifest.mapping[symbolName]);
      }

      if (symbol.displayName === 'QwikCity_component_useWatch') {
        const bundle = manifest.bundles[bundleName];
        if (bundle?.dynamicImports) {
          for (const dynamicImport of bundle.dynamicImports) {
            libraryBundles.add(dynamicImport);
          }
        }
      }
    }
  }

  return `const libraryBundles=${JSON.stringify(Array.from(libraryBundles))};`;
}

function getLinkBundleNames(ctx: BuildContext, manifest: QwikManifest, route: BuildRoute) {
  const bundleNames: string[] = [];
  const filePaths: string[] = [];
  const checkedSymbols = new Set<string>();

  const addSymbol = (symbolName: string | null) => {
    if (symbolName && !checkedSymbols.has(symbolName)) {
      checkedSymbols.add(symbolName);

      const symbol = manifest.symbols[symbolName];
      if (symbol) {
        const bundleName = manifest.mapping[symbolName];
        if (!bundleNames.includes(bundleName)) {
          bundleNames.push(bundleName);
        }

        for (const childSymbolName in manifest.symbols) {
          const childSymbol = manifest.symbols[childSymbolName];
          if (childSymbol.parent === symbolName) {
            addSymbol(childSymbolName);
          }
        }
      }
    }
  };

  for (const layout of route.layouts) {
    filePaths.push(layout.filePath);
  }
  filePaths.push(route.filePath);

  for (const symbolName in manifest.symbols) {
    const symbol = manifest.symbols[symbolName];

    for (const filePath of filePaths) {
      if (filePath.endsWith(symbol.origin)) {
        addSymbol(symbolName);
      }
    }
  }

  return bundleNames;
}

const SW_UNREGISTER = `
navigator.serviceWorker.getRegistrations().then((regs) => {
  for (const reg of regs) {
    reg.unregister();
  }
});
`;
