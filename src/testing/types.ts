import type { CorePlatform } from '@builder.io/qwik';
import type {
  DocumentOptions,
  GlobalOptions,
  QwikDocument,
  QwikGlobal,
} from '@builder.io/qwik/server';

export interface MockDocument extends QwikDocument {}

export interface MockGlobal extends QwikGlobal {
  document: MockDocument;
}

/**
 * Options when creating a mock Qwik Document object.
 * @public
 */
export interface MockDocumentOptions extends DocumentOptions {}

/**
 * Options when creating a mock Qwik Global object.
 * @public
 */
export interface MockGlobalOptions extends GlobalOptions {}

/**
 * @public
 */
export interface TestPlatform extends CorePlatform {
  flush: () => Promise<void>;
}
