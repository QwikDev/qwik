import { manifest } from '@qwik-client-manifest';
import type { ServerQwikManifest } from '@qwik.dev/core/optimizer';

/**
 * Returns the client build manifest, which includes the mappings from symbols to bundles, the
 * bundlegraph etc.
 *
 * @public
 */
export const getClientManifest = (): ServerQwikManifest => manifest;
