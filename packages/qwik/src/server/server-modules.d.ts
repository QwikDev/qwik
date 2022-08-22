import { QwikManifest, QwikSymbol } from './index';

declare module '@qwik-client-manifest' {
  const symbols: QwikSymbol;
  const mapping: { [symbolName: string]: string };
  const bundles: { [bundleName: string]: string };
  const bundleImports: { [bundleName: string]: string[] };
  const manifest: QwikManifest;
  export { symbols, mapping, bundles, bundleImports, manifest };
}
