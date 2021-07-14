/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { createGlobal as createServerGlobal } from '@builder.io/qwik/server';
import { setTestPlatform } from './platform';
import type { MockDocumentOptions, MockGlobalOptions, MockDocument, MockGlobal } from './types';

/**
 * Create emulated `QwikGlobal` useful for testing.
 */
export function createGlobal(opts: MockDocumentOptions = {}): MockGlobal {
  const gbl = createServerGlobal(opts);
  setTestPlatform(gbl.document);
  return gbl as any;
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(opts: MockGlobalOptions = {}): MockDocument {
  const gbl = createGlobal(opts);
  return gbl.document;
}
