import { createWindow as createServerWindow } from '@builder.io/qwik/server';
import { setTestPlatform } from './platform';
import type { MockDocumentOptions, MockWindowOptions, MockDocument, MockWindow } from './types';

/**
 * Create emulated `window` useful for testing.
 */
export function createWindow(opts: MockDocumentOptions = {}): MockWindow {
  const win = createServerWindow(opts);
  setTestPlatform(win.document);
  return win as any;
}

/**
 * Create emulated `document` for testing.
 */
export function createDocument(opts: MockWindowOptions = {}): MockDocument {
  return createWindow(opts).document;
}
