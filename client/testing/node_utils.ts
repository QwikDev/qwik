/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import domino from 'domino';
import srcMap from 'source-map-support';
import { newError } from '../assert/assert.js';
srcMap.install();

/**
 * Partial Global used by Qoot Framework.
 *
 * A set of properties which the Qoot Framework expects to find on global.
 */
export interface QootGlobal {
  /**
   * Document used by Qoot during rendering.
   */
  document: Document;
}

/**
 * Create emulated `QootGlobal` useful for testing.
 */
export function createGlobal(baseUri?: string) {
  return { document: createDocument(baseUri) };
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(baseUri?: string): Document {
  const document = domino.createDocument();
  Object.defineProperty(document, 'baseURI', { value: baseUri || getBaseUri() });
  return document;
}

/**
 * Return the baseUri from the stack trace.
 *
 * @param include Return the first URI which matches the expression.
 * @param exclude Ignore all URLs which match expression
 */
export function getBaseUri(include?: RegExp | null, exclude?: RegExp | null): string {
  const error = new Error();
  const frames = error.stack!.split('\n');
  frames.shift(); // 0th frame is error message.
  frames.shift(); // 1st frame is getBaseUri function.
  while (frames.length) {
    const previousFrame = frames.shift()!;
    const match = previousFrame.match(/\(?(\S*):\d+:\d+\)?/);
    if (!match) {
      throw newError('Unrecognized stack format: ' + previousFrame);
    }
    const uri = match[1];
    if (THIS_FILE.test(uri) || (exclude && exclude.test(uri))) {
      // Ignore all stack frames from this file or from exclude.
      continue;
    }
    if (include == null ? true : include.test(uri)) {
      // If no include assume match.
      return uri;
    }
  }
  throw newError('No stack frames matched: ' + include + ' but not ' + exclude);
}

const THIS_FILE = /\/testing\/node_utils\.\w+$/;
