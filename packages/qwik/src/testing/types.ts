import type { CorePlatform } from '@qwik.dev/core';

/**
 * Options when creating a mock Qwik Document object.
 *
 * @public
 */
export interface MockDocumentOptions {
  url?: URL | string;
  html?: string;
}

/** @public */
export interface TestPlatform extends CorePlatform {
  flush: () => Promise<void>;
}
