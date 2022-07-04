import type { CorePlatform } from '@builder.io/qwik';

export interface MockDocument extends Document {}

export interface MockWindow extends Window {
  document: MockDocument;
}

/**
 * Options when creating a mock Qwik Document object.
 * @public
 */
export interface MockDocumentOptions {
  url?: URL | string;
  html?: string;
}

/**
 * Options when creating a mock Qwik Window object.
 */
export interface MockWindowOptions extends MockDocumentOptions {}

/**
 */
export interface TestPlatform extends CorePlatform {
  flush: () => Promise<void>;
}
