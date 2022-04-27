import type { CorePlatform } from '@builder.io/qwik';
import type {
  DocumentOptions,
  QwikDocument,
  QwikWindow,
  WindowOptions,
} from '@builder.io/qwik/server';

export interface MockDocument extends QwikDocument {}

export interface MockWindow extends QwikWindow {
  document: MockDocument;
}

/**
 * Options when creating a mock Qwik Document object.
 * @public
 */
export interface MockDocumentOptions extends DocumentOptions {}

/**
 * Options when creating a mock Qwik Window object.
 * @public
 */
export interface MockWindowOptions extends WindowOptions {}

/**
 * @public
 */
export interface TestPlatform extends CorePlatform {
  flush: () => Promise<void>;
}

/**
 * @public
 */
export interface QConfig {
  baseURI?: string;
  protocol?: { [protocol: string]: string };
}
