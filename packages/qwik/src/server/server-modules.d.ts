import { QwikManifest } from './index';

declare module '@qwik-client-manifest' {
  const manifest: QwikManifest;
  export { manifest };
}
