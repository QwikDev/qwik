import type { ServerQwikManifest } from '@qwik.dev/core/optimizer';

/**
 * Returns the client build manifest, which includes the mappings from symbols to bundles, the
 * bundlegraph etc.
 *
 * @public
 */
export const getClientManifest = (): ServerQwikManifest | undefined => {
  // Keep this first because the magic-string first replaces the `!...` version and it can't replace after that.
  const manifest = (globalThis as any).__QWIK_MANIFEST__ as ServerQwikManifest | undefined;
  /**
   * Keep as-is, this is replaced verbatim with `false` by the qwikVite plugin, so this function
   * only throws if the build was not done correctly + no manifest was provided on globalThis.
   */
  if (!(globalThis as any).__QWIK_MANIFEST__) {
    throw new Error(
      `Client manifest is not available. It should have been automatically injected during the build process. Make sure that @qwik.dev/core is internal to the build.`
    );
  }
  return manifest;
};
