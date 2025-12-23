import type { ServerQwikManifest } from '@qwik.dev/core/optimizer';

/**
 * Returns the client build manifest, which includes the mappings from symbols to bundles, the
 * bundlegraph etc.
 *
 * @public
 */
export const getClientManifest = (): ServerQwikManifest => {
  const manifest = (globalThis as any).__QWIK_MANIFEST__ as ServerQwikManifest;
  if (!(globalThis as any).__QWIK_MANIFEST__) {
    throw new Error(
      `Client manifest is not available. It should have been automatically injected during the build process. Make sure that @qwik.dev/core is internal to the build.`
    );
  }
  return manifest;
};
