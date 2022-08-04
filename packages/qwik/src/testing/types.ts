import type { CorePlatform } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface MockDocument extends Document {}

/**
 * @alpha
 */
export interface MockWindow extends Window {
  document: MockDocument;
}

/**
 * Options when creating a mock Qwik Document object.
 * @alpha
 */
export interface MockDocumentOptions {
  url?: URL | string;
  html?: string;
}

/**
 * Options when creating a mock Qwik Window object.
 *
 * @alpha
 *
 */
export interface MockWindowOptions extends MockDocumentOptions {}

/**
 * @alpha
 */
export interface TestPlatform extends CorePlatform {
  flush: () => Promise<void>;
}
