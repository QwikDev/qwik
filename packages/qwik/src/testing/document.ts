import { _createDocument } from '@builder.io/qwik/server';
import { setTestPlatform } from './platform';
import type { MockDocumentOptions, MockWindowOptions, MockDocument, MockWindow } from './types';

/**
 * Create emulated `window` useful for testing.
 */
export function createWindow(opts: MockDocumentOptions = {}): MockWindow {
  const win = _createDocument(opts).defaultView;
  setTestPlatform(win.document);
  return win;
}

/**
 * Create emulated `document` for testing.
 */
export function createDocument(opts: MockWindowOptions = {}): MockDocument {
  const doc = _createDocument(opts);
  setTestPlatform(doc);
  return doc;
}
